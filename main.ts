import { 
        App, 
        Plugin, 
        TFile, 
        Notice, 
        WorkspaceLeaf, 
        FileSystemAdapter,
        Workspace,
        WorkspaceWindow, 
        FileView,
        Menu,
        MarkdownView,
    } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as Types from './_types';
import { PasswordModal } from 'Modals/PasswordModal';
import { ExampleView, VIEW_TYPE_EXAMPLE } from 'views';

export default class Heimdall extends Plugin {
    private protectedFiles: Types.FileInfo[] = [];
    private statusBarItemEl: HTMLElement;
    private unlockRibbonEl: HTMLElement | null;

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
        this.registerEvent(this.app.workspace.on('file-open', (file: TFile | null) => {
            // this.updateStatusBar(currentLeaf);
            // this.updateContentVisibility(currentLeaf);
            // this.updateRibbonIcon(currentLeaf);
            if (file instanceof TFile) {
                if (this.isFileProtected(file)) {
                    if (this.unlockRibbonEl) {
                        console.log('unlock exists');
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
                }
            }

            // const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            // if (markdownView) {
            //     console.log(markdownView instanceof FileView);
            //     if (markdownView.file instanceof TFile && this.isFileProtected(markdownView.file)) {
            //         this.addRibbonIcon("unlock", "Unlock this file", () => {
            //             console.log('Cockkkkkks');
            //         });
            //     }

            // }

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

        this.registerView(
            VIEW_TYPE_EXAMPLE,
            (leaf) => new ExampleView(leaf)
          );
      
    }

    updateRibbonIcon(leaf: WorkspaceLeaf | null) {

    }

    async activateView() {
        const { workspace } = this.app;
    
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);
    
        if (leaves.length > 0) {
          // A leaf with our view already exists, use that
          leaf = leaves[0];
        } else {
          // Our view could not be found in the workspace, create a new leaf
          // in the right sidebar for it
          leaf = workspace.getRightLeaf(false);
          await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
        }
    
        // "Reveal" the leaf in case it is in a collapsed sidebar
        workspace.revealLeaf(leaf);
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
        // console.log(this.app.workspace.containerEl);

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

        // Update the file explorer icons
        // this.updateFileExplorerIcons(file);
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
