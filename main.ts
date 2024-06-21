import { App, Plugin, TFile, Notice, WorkspaceLeaf } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
    filePath?: string;
    ctime?: string;
  }

export default class PasswordProtectPlugin extends Plugin {
    private protectedFiles: FileInfo[];
    private statusBarItemEl: HTMLElement;

    async onload() {
        console.log('Loading Password Protect Plugin');

        // Load protected files from storage
        await this.loadProtectedFiles();

         // Add the context menu item to lock/unlock a file
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile) {
            const isProtected = this.isFileProtected(file);
            menu.addItem((item) => {
                item.setTitle(isProtected ? 'Unlock file' : 'Lock file')
                    .setIcon('lock')
                    .onClick(() => this.lockFile(file));
            });
        }
    }));

        // Add a status bar item
        this.statusBarItemEl = this.addStatusBarItem();

        // Update the status bar when the active leaf changes
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
            this.updateStatusBar(leaf);
        }));

        // Initial status bar update
        this.updateStatusBar(this.app.workspace.activeLeaf);
    }

    async lockFile(file: TFile) {
        // this.protectedFiles.add(file.path);
        const newProtectedFile:FileInfo = {
            ctime: file.stat.ctime.toString(),
            filePath: file.path,
        }
        if (this.isFileProtected(file)) {
            this.protectedFiles = <FileInfo[]>this.protectedFiles.filter(obj => obj.filePath !== file.path);
        } else {
            this.protectedFiles.push(newProtectedFile);
        }
        console.log(`Protected files count: ${this.protectedFiles.length}`);
        new Notice(`Locked file: ${file.path}`);

        // Save protected files to storage
        await this.saveProtectedFiles();
    }

    async saveProtectedFiles() {
        try {
            const data = Array.from(this.protectedFiles);
            const filePath = this.getDataFilePath();
            fs.writeFileSync(filePath, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save protected files:', error);
        }
    }

    async loadProtectedFiles() {
        try {
            const filePath = this.getDataFilePath();
            console.log(`File path: ${filePath}`)
            if (!fs.existsSync(filePath)) {
                console.log("DNE, tried creating")
                fs.writeFileSync(filePath, JSON.stringify([]));  // Create an empty JSON file if it doesn't exist
            }
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            this.protectedFiles = <FileInfo[]>data;
            console.log(`Loaded ${this.protectedFiles.length} protected files from storage.`);
        } catch (error) {
            console.error('Failed to load protected files:', error);
        }
    }

    getDataFilePath(): string {
        return path.join(this.app.vault.adapter.getBasePath(),'.obsidian','plugins', this.manifest.id, 'data', 'protectedFiles.json');
    }

    isFileProtected(file: TFile): boolean {
        // return this.protectedFiles.has(file.path);
        for (const _file of this.protectedFiles) {
            if (file.path === _file.filePath) {
                return true;
            }
        }

        return false;
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

    async onunload() {
        console.log('Unloading Password Protect Plugin');
        // Save protected files to storage
        await this.saveProtectedFiles();
    }
}
