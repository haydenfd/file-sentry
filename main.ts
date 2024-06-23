import { 
        App, 
        Plugin, 
        TFile, 
        Notice, 
        WorkspaceLeaf, 
        FileSystemAdapter,
        FileView,
        Menu,
        MarkdownView,
    } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as Types from './_types';
import { PasswordModal } from 'Modals/PasswordModal';

export default class Heimdall extends Plugin {
    private protectedFiles: Types.FileInfo[] = [];
    private statusBarItemEl: HTMLElement;
    private unlockRibbonEl: HTMLElement | null;

    async onload() {

        await this.loadProtectedFiles();
        this.addCssClass();
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

        this.statusBarItemEl = this.addStatusBarItem();

        // Update the status bar when the active leaf changes
        this.registerEvent(this.app.workspace.on('file-open', (file: TFile | null) => {
            // this.updateStatusBar(currentLeaf);
            // this.updateContentVisibility(currentLeaf);
            // this.updateRibbonIcon(currentLeaf);
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                const containerEl = activeView.containerEl;
                console.log('Active file container element:', containerEl);

                if (containerEl) {
                    containerEl.style.visibility = 'hidden';
                    // Create a placeholder div
            const placeholder = document.createElement('div');
            placeholder.className = 'protected-file-placeholder';
            placeholder.style.display = 'flex';
            placeholder.style.flexDirection = 'column';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.height = '100%';
            placeholder.innerHTML = `
                <div>File is password protected</div>
                <button id="unlock-btn">Unlock</button>
            `;
            
            // Append the placeholder to the container's parent
            containerEl.parentElement?.appendChild(placeholder);

            // Add event listener to the unlock button
            const unlockButton = placeholder.querySelector('#unlock-btn');
            unlockButton?.addEventListener('click', () => {
                // Remove the placeholder
                placeholder.remove();
                // Make the containerEl visible again
                containerEl.style.visibility = 'visible';
            });
                }
            } else {
                console.log('No active markdown view found.');
            }
            if (file instanceof TFile) {

                if (this.isFileProtected(file)) {
                    if (this.unlockRibbonEl) {
                        this.unlockRibbonEl.remove();
                        this.unlockRibbonEl = null;
                    }
                
            
                this.unlockRibbonEl = this.addRibbonIcon('unlock', 'Unlock File', () => {
                        new Notice('Enter password!');
                        this.unlockRibbonEl?.remove();
                        this.unlockRibbonEl = this.addRibbonIcon('lock', 'Lock File', () => {
                            new Notice("Locked");
                        });

                      });
                } else {
                    this.unlockRibbonEl?.remove();
                }
            }

        }));

        // Initial status bar update
        this.updateStatusBar(this.app.workspace.activeLeaf);
        this.updateContentVisibility(this.app.workspace.getActiveFile());
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
        const style = <HTMLStyleElement>document.createElement('style');
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
            // this.addToggleIcon(activeLeaf);
        }

    }

    async saveProtectedFiles() {
        try {
            const data = JSON.stringify(this.protectedFiles, null, 2);
            const protectedFilesStorePath = this.getProtectedFileStoreAbsolutePath();
            fs.writeFileSync(protectedFilesStorePath, data);
            // maybe not json but txt then can use DataAdapter. Could be moot though
        } catch (error) {
            console.error('Failed to save protected files:', error);
        }
    }

    async loadProtectedFiles() {
        try {
            const filePath = this.getProtectedFileStoreAbsolutePath();
            console.log(`File path: ${filePath}`);

            const data:ArrayBuffer = await FileSystemAdapter.readLocalFile(filePath);
            if (data) {
                console.log(data); // error handling if the json file DNE. Needed here?
            }
            const decoder = new TextDecoder('utf-8');
            this.protectedFiles = JSON.parse(decoder.decode(data));
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

    updateContentVisibility(activeFile: TFile | null) {
        // if (!leaf || !leaf.view || !(leaf.view.file instanceof TFile)) {
        //     return;
        // }

        // const file = leaf.view.file as TFile;
        // if (this.isFileProtected(file)) {
        //     leaf.view.containerEl.classList.add('hidden-content');
        //     this.addPlaceholder(leaf.view.containerEl);
        // } else {
        //     leaf.view.containerEl.classList.remove('hidden-content');
        //     this.removePlaceholder(leaf.view.containerEl);
        // }
        if (!activeFile) return;
        console.log(activeFile);
    }

    addPlaceholder(containerEl: HTMLElement | null) {

        let placeholder = containerEl?.querySelector('.placeholder');
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'placeholder';
            placeholder.innerHTML = `
                <div>Oh, this file is password protected</div>
                <button id="unlock-btn">Unlock</button>
            `;
            containerEl?.appendChild(placeholder);

            const unlockButton = placeholder.querySelector('#unlock-btn');
            unlockButton?.addEventListener('click', () => {
                new PasswordModal(this.app, () => {
                    containerEl?.classList.remove('hidden-content');
                    this.removePlaceholder(containerEl);
                }).open();
            });
        }
    }

    removePlaceholder(containerEl: HTMLElement | null) {
        const placeholder = containerEl?.querySelector('.placeholder');
        if (placeholder) {
            containerEl?.removeChild(placeholder);
        }
    }

    async onunload() {

        await this.saveProtectedFiles();

        // Remove the hidden-content class and placeholders from all leaves --  Should not be necessary?
        const leaves = this.app.workspace.getLeavesOfType('*');
        this.unlockRibbonEl?.remove();
        leaves.forEach(leaf => {
            if (leaf.view) {
                leaf.view.containerEl.classList.remove('hidden-content');
                this.removePlaceholder(leaf.view.containerEl);
            }
        });
    }
}
