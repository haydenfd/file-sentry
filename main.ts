import { App, Plugin, TFile, Notice, WorkspaceLeaf, Modal, ButtonComponent } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
    filePath?: string;
    ctime?: string;
}

class UnlockModal extends Modal {
    onSubmit: () => void;

    constructor(app: App, onSubmit: () => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const submitButton = new ButtonComponent(contentEl)
            .setButtonText("Submit")
            .onClick(() => {
                this.onSubmit();
                this.close();
            });

        contentEl.appendChild(submitButton.buttonEl);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class PasswordProtectPlugin extends Plugin {
    private protectedFiles: FileInfo[] = [];
    private statusBarItemEl: HTMLElement;

    async onload() {
        console.log('Loading Password Protect Plugin');

        // Load protected files from storage
        await this.loadProtectedFiles();

        // Add CSS to hide the content and show the placeholder
        this.addCssClass();

        // Add the context menu item to lock/unlock a file
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
            if (file instanceof TFile) {
                const isProtected = this.isFileProtected(file);
                menu.addItem((item) => {
                    item.setTitle(isProtected ? 'Unlock file' : 'Lock file')
                        .setIcon('lock')
                        .onClick(() => this.toggleFileProtection(file, isProtected));
                });
            }
        }));

        // Add a status bar item
        this.statusBarItemEl = this.addStatusBarItem();

        // Update the status bar when the active leaf changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
            this.updateStatusBar(leaf);
            this.updateContentVisibility(leaf);
        }));

        // Initial status bar update
        this.updateStatusBar(this.app.workspace.activeLeaf);
        this.updateContentVisibility(this.app.workspace.activeLeaf);

        // Add a ribbon icon to toggle visibility
        const ribbonIconEl = this.addRibbonIcon('dice', 'Toggle Visibility', () => {
            this.toggleActiveLeafVisibility();
        });

        // Perform additional things with the ribbon
        ribbonIconEl.addClass('password-protect-ribbon-class');
    }

    addCssClass() {
        const style = document.createElement('style');
        style.textContent = `
            .hidden-content .view-content {
                visibility: hidden;
            }
            .hidden-content .placeholder {
                display: flex;
                justify-content: center;
                align-items: center;
                flex-direction: column;
                position: absolute;
                top: -50px;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10;
                text-align: center;
                font-size: 1.5em;
                color: dodgerblue;
            }
            .placeholder {
                display: none;
            }
        `;
        document.head.append(style);
    }

    async toggleFileProtection(file: TFile, isProtected: boolean) {
        if (isProtected) {
            this.protectedFiles = this.protectedFiles.filter(obj => obj.filePath !== file.path);
            new Notice(`Unlocked file: ${file.path}`);
        } else {
            const newProtectedFile: FileInfo = {
                ctime: file.stat.ctime.toString(),
                filePath: file.path,
            };
            this.protectedFiles.push(newProtectedFile);
            new Notice(`Locked file: ${file.path}`);
        }
        console.log(`Protected files count: ${this.protectedFiles.length}`);

        // Save protected files to storage
        await this.saveProtectedFiles();

        // Update the visibility of the content
        this.updateContentVisibility(this.app.workspace.activeLeaf);
    }

    async saveProtectedFiles() {
        try {
            const data = JSON.stringify(this.protectedFiles);
            const filePath = this.getDataFilePath();
            fs.writeFileSync(filePath, data);
        } catch (error) {
            console.error('Failed to save protected files:', error);
        }
    }

    async loadProtectedFiles() {
        try {
            const filePath = this.getDataFilePath();
            console.log(`File path: ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log("DNE, tried creating");
                fs.writeFileSync(filePath, JSON.stringify([]));  // Create an empty JSON file if it doesn't exist
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            this.protectedFiles = data;
            console.log(`Loaded ${this.protectedFiles.length} protected files from storage.`);
        } catch (error) {
            console.error('Failed to load protected files:', error);
        }
    }

    getDataFilePath(): string {
        return path.join(this.app.vault.adapter.getBasePath(), '.obsidian', 'plugins', this.manifest.id, 'data', 'protectedFiles.json');
    }

    isFileProtected(file: TFile): boolean {
        return this.protectedFiles.some(protectedFile => protectedFile.filePath === file.path);
    }

    updateStatusBar(leaf: WorkspaceLeaf | null) {
        if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
            this.statusBarItemEl.setText('');
            return;
        }

        const file = leaf.view.file as TFile;
        if (this.isFileProtected(file)) {
            this.statusBarItemEl.setText('PROTECTED');
        } else {
            this.statusBarItemEl.setText('');
        }
    }

    updateContentVisibility(leaf: WorkspaceLeaf | null) {
        if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
            return;
        }

        const file = leaf.view.file as TFile;
        if (this.isFileProtected(file)) {
            leaf.view.containerEl.classList.add('hidden-content');
            this.addPlaceholder(leaf.view.containerEl);
        } else {
            leaf.view.containerEl.classList.remove('hidden-content');
            this.removePlaceholder(leaf.view.containerEl);
        }
    }

    toggleActiveLeafVisibility() {
        const leaf = this.app.workspace.activeLeaf;
        if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
            return;
        }

        if (leaf.view.containerEl.classList.contains('hidden-content')) {
            leaf.view.containerEl.classList.remove('hidden-content');
            this.removePlaceholder(leaf.view.containerEl);
        } else {
            leaf.view.containerEl.classList.add('hidden-content');
            this.addPlaceholder(leaf.view.containerEl);
        }
    }

    addPlaceholder(containerEl: HTMLElement) {
        let placeholder = containerEl.querySelector('.placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'placeholder';
            placeholder.innerHTML = `
                <div>Oh, this file is password protected</div>
                <button id="unlock-btn">Unlock</button>
            `;
            containerEl.appendChild(placeholder);

            const unlockButton = placeholder.querySelector('#unlock-btn');
            unlockButton?.addEventListener('click', () => {
                new UnlockModal(this.app, () => {
                    containerEl.classList.remove('hidden-content');
                    this.removePlaceholder(containerEl);
                }).open();
            });
        }
    }

    removePlaceholder(containerEl: HTMLElement) {
        const placeholder = containerEl.querySelector('.placeholder');
        if (placeholder) {
            containerEl.removeChild(placeholder);
        }
    }

    async onunload() {
        console.log('Unloading Password Protect Plugin');
        // Save protected files to storage
        await this.saveProtectedFiles();

        // Remove the hidden-content class and placeholders from all leaves
        const leaves = this.app.workspace.getLeavesOfType('*');
        leaves.forEach(leaf => {
            if (leaf.view) {
                leaf.view.containerEl.classList.remove('hidden-content');
                this.removePlaceholder(leaf.view.containerEl);
            }
        });
    }
}
