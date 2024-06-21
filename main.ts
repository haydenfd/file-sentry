import { App, Plugin, TFile, Notice, WorkspaceLeaf, ButtonComponent, FileSystemAdapter } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as Types from './_types';
import { PasswordModal } from 'Modals/PasswordModal';


export default class Heimdall extends Plugin {
    private protectedFiles: Types.FileInfo[] = [];
    private statusBarItemEl: HTMLElement;

    async onload() {
        console.log('Loading Password Protect Plugin');
        console.log(this.getProtectedFileStoreAbsolutePath());

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
            // this.addToggleIcon(leaf);
        }));

        // Initial status bar update
        this.updateStatusBar(this.app.workspace.activeLeaf);
        this.updateContentVisibility(this.app.workspace.activeLeaf);
        // this.addToggleIcon(this.app.workspace.activeLeaf);

        // Add a ribbon icon to toggle visibility
        // const ribbonIconEl = this.addRibbonIcon('dice', 'Toggle Visibility', () => {
        //     this.toggleActiveLeafVisibility();
        // });

        // // Perform additional things with the ribbon
        // ribbonIconEl.addClass('password-protect-ribbon-class');

        // // Add lock icons to protected files in the file explorer
        // this.registerEvent(this.app.vault.on('modify', (file) => {
        //     if (file instanceof TFile) {
        //         this.updateFileExplorerIcons(file);
        //     }
        // }));

        // // Initial file explorer icons update
        // this.updateAllFileExplorerIcons();
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
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10;
                text-align: center;
                font-size: 1.5em;
                color: dodgerblue;
                gap: 2rem;
            }
            .placeholder {
                display: none;
            }
            .toggle-lock-icon {
                cursor: pointer;
                margin-left: 8px;
            }
            .file-explorer-lock-icon {
                margin-left: auto;
                margin-right: 8px;
                cursor: pointer;
            }
        `;
        document.head.append(style);
    }

    async toggleFileProtection(file: TFile, isProtected: boolean) {
        if (isProtected) {
            this.protectedFiles = this.protectedFiles.filter(obj => obj.filePath !== file.path);
            new Notice(`Unlocked file: ${file.path}`);
        } else {
            const newProtectedFile: Types.FileInfo = {
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

        // Immediately update visibility if the toggled file is currently active
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view && activeLeaf.view.file === file) {
            this.updateContentVisibility(activeLeaf);
            this.addToggleIcon(activeLeaf);
        }

        // Update the file explorer icons
        this.updateFileExplorerIcons(file);
    }

    async saveProtectedFiles() {
        try {
            const data = JSON.stringify(this.protectedFiles);
            const filePath = this.getProtectedFileStoreAbsolutePath();
            fs.writeFileSync(filePath, data);
        } catch (error) {
            console.error('Failed to save protected files:', error);
        }
    }

    async loadProtectedFiles() {
        try {
            const filePath = this.getProtectedFileStoreAbsolutePath();
            console.log(`File path: ${filePath}`);
            if (!fs.existsSync(filePath)) {
                console.log("DNE, tried creating");
                fs.writeFileSync(filePath, JSON.stringify([]));  // There has to be a better way to do this. 
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            this.protectedFiles = data;
            console.log(`Loaded ${this.protectedFiles.length} protected files from storage.`);
        } catch (error) {
            console.error('Failed to load protected files:', error);
        }
    }

    getProtectedFileStoreAbsolutePath() : string {
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return String(
                path.join(adapter.getBasePath(), 
                '.obsidian', 
                'plugins', 
                this.manifest.id, 
                'data', 
                'protectedFiles.json'
            ));
        } else {
            // In theory, we should never get here?
            return "";
        }
    }

    isFileProtected = (file: TFile) : boolean => {
        return this.protectedFiles.some(protectedFile => protectedFile.filePath === file.path); // fix this with a loop
    };

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

    // toggleActiveLeafVisibility() {
    //     const leaf = this.app.workspace.activeLeaf;
    //     if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
    //         return;
    //     }

    //     if (this.isFileProtected(leaf.view.file)) {
    //         if (leaf.view.containerEl.classList.contains('hidden-content')) {
    //             leaf.view.containerEl.classList.remove('hidden-content');
    //             this.removePlaceholder(leaf.view.containerEl);
    //             this.addToggleIcon(leaf);
    //         } else {
    //             leaf.view.containerEl.classList.add('hidden-content');
    //             this.addPlaceholder(leaf.view.containerEl);
    //             this.addToggleIcon(leaf);
    //         }
    //     }
    // }

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
                new PasswordModal(this.app, () => {
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

    // addToggleIcon(leaf: WorkspaceLeaf | null) {
    //     if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
    //         return;
    //     }

    //     const file = leaf.view.file as TFile;
    //     if (!this.isFileProtected(file)) {
    //         return;
    //     }

    //     const headerEl = leaf.view.containerEl.querySelector('.view-header');
    //     if (!headerEl) {
    //         return;
    //     }

    //     let toggleIcon = headerEl.querySelector('.toggle-lock-icon');
    //     if (!toggleIcon) {
    //         toggleIcon = document.createElement('div');
    //         toggleIcon.className = 'toggle-lock-icon';
    //         headerEl.appendChild(toggleIcon);
    //     }

    //     toggleIcon.innerHTML = leaf.view.containerEl.classList.contains('hidden-content')
    //         ? '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="lock-keyhole-open" class="svg-inline--fa fa-lock-keyhole-open fa-w-14" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M400 192h-24V112c0-61.86-50.14-112-112-112S152 50.14 152 112v80h-24C57.31 192 0 249.3 0 320v128c0 70.69 57.31 128 128 128h272c70.69 0 128-57.31 128-128V320c0-70.7-57.3-128-128-128zM128 320v128c0 35.29 28.71 64 64 64h160c35.29 0 64-28.71 64-64V320c0-35.29-28.71-64-64-64H192c-35.29 0-64 28.71-64 64zM224 320h48c8.84 0 16 7.16 16 16s-7.16 16-16 16h-48c-8.84 0-16-7.16-16-16s7.16-16 16-16zm160-208V112c0-44.11-35.89-80-80-80s-80 35.89-80 80v80h160z"></path></svg>'
    //         : '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="lock-keyhole" class="svg-inline--fa fa-lock-keyhole fa-w-14" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M400 192h-24V112c0-61.86-50.14-112-112-112S152 50.14 152 112v80h-24C57.31 192 0 249.3 0 320v128c0 70.69 57.31 128 128 128h272c70.69 0 128-57.31 128-128V320c0-70.7-57.3-128-128-128zM128 320v128c0 35.29 28.71 64 64 64h160c35.29 0 64-28.71 64-64V320c0-35.29-28.71-64-64-64H192c-35.29 0-64 28.71-64 64zM224 320h48c8.84 0 16 7.16 16 16s-7.16 16-16 16h-48c-8.84 0-16-7.16-16-16s7.16-16 16-16zm160-208V112c0-44.11-35.89-80-80-80s-80 35.89-80 80v80h160z"></path></svg>';

    //     toggleIcon.onclick = () => {
    //         if (leaf.view.containerEl.classList.contains('hidden-content')) {
    //             new PasswordModal(this.app, () => {
    //                 leaf.view.containerEl.classList.remove('hidden-content');
    //                 this.removePlaceholder(leaf.view.containerEl);
    //                 this.addToggleIcon(leaf);
    //             }).open();
    //         } else {
    //             leaf.view.containerEl.classList.add('hidden-content');
    //             this.addPlaceholder(leaf.view.containerEl);
    //             this.addToggleIcon(leaf);
    //         }
    //     };
    // }

    // updateFileExplorerIcons(file: TFile) {
    //     const fileExplorerEl = document.querySelector(`[data-path="${file.path}"]`);
    //     if (!fileExplorerEl) {
    //         return;
    //     }

    //     let lockIcon = fileExplorerEl.querySelector('.file-explorer-lock-icon');
    //     if (!lockIcon) {
    //         lockIcon = document.createElement('div');
    //         lockIcon.className = 'file-explorer-lock-icon';
    //         fileExplorerEl.appendChild(lockIcon);
    //     }

    //     if (this.isFileProtected(file)) {
    //         lockIcon.innerHTML = '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="lock-keyhole" class="svg-inline--fa fa-lock-keyhole fa-w-14" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M400 192h-24V112c0-61.86-50.14-112-112-112S152 50.14 152 112v80h-24C57.31 192 0 249.3 0 320v128c0 70.69 57.31 128 128 128h272c70.69 0 128-57.31 128-128V320c0-70.7-57.3-128-128-128zM128 320v128c0 35.29 28.71 64 64 64h160c35.29 0 64-28.71 64-64V320c0-35.29-28.71-64-64-64H192c-35.29 0-64 28.71-64 64zM224 320h48c8.84 0 16 7.16 16 16s-7.16 16-16 16h-48c-8.84 0-16-7.16-16-16s7.16-16 16-16zm160-208V112c0-44.11-35.89-80-80-80s-80 35.89-80 80v80h160z"></path></svg>';
    //         lockIcon.onclick = () => this.toggleFileProtection(file, true);
    //     } else {
    //         lockIcon.innerHTML = '';
    //     }
    // }

    // updateAllFileExplorerIcons() {
    //     const allFiles = this.app.vault.getFiles();
    //     allFiles.forEach(file => this.updateFileExplorerIcons(file));
    // }

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
