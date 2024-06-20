import { App, Modal, Notice, Plugin, MarkdownView, TFile, Menu, Vault } from 'obsidian';

class PasswordModal extends Modal {
    private onSubmit: (password: string) => void;

    constructor(app: App, onSubmit: (password: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('password-modal');

        contentEl.createEl('h2', { text: 'Heimdall says stop!' });

        const inputEl = contentEl.createEl('input', {
            type: 'password',
            placeholder: "What's the pass, bro?",
        });

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
        const submitButton = buttonContainer.createEl('button', { text: 'Submit' });

        submitButton.onclick = () => {
            this.onSubmit(inputEl.value);
            this.close();
        };

        inputEl.onkeydown = (event) => {
            if (event.key === 'Enter') {
                this.onSubmit(inputEl.value);
                this.close();
            }
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class PasswordProtectPlugin extends Plugin {
    private correctPassword: string = "voodoo";
    private lockedFiles: Map<string, string> = new Map();  // Store original content

    async onload() {
        console.log('Loading Password Protect Plugin');

        // Add a ribbon icon to the left sidebar
        const ribbonIconEl = this.addRibbonIcon('lock', 'Password Protect', (evt: MouseEvent) => {
            // Open a modal when the icon is clicked
            new PasswordModal(this.app, (password) => {
                if (password === this.correctPassword) {
                    new Notice('Password correct. Revealing content.');
                    this.revealContent();
                } else {
                    new Notice('Incorrect password. Try again.');
                }
            }).open();
        });

        // Add the context menu item to lock a file
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
            if (file instanceof TFile) {
                menu.addItem((item) => {
                    item.setTitle('Lock file')
                        .setIcon('lock')
                        .onClick(() => this.lockFile(file));
                });
            }
        }));

        // Hook into file open event to prompt for password if the file is locked
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && this.lockedFiles.has(activeFile.path)) {
                this.promptForPassword(activeFile);
            }
        }));

        // Perform additional things with the ribbon
        ribbonIconEl.addClass('password-protect-ribbon-class');
    }

    revealContent() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
            const markdownView = activeLeaf.view as MarkdownView;
            markdownView.setMode("preview");
        }
    }

    async lockFile(file: TFile) {
        const content = await this.app.vault.read(file);
        this.lockedFiles.set(file.path, content);

        await this.app.vault.modify(file, 'Sorry, password needed.');
        new Notice(`Locked file: ${file.path}`);
    }

    async promptForPassword(file: TFile) {
        new PasswordModal(this.app, async (password) => {
            if (password === this.correctPassword) {
                const originalContent = this.lockedFiles.get(file.path);
                if (originalContent) {
                    await this.app.vault.modify(file, originalContent);
                    this.lockedFiles.delete(file.path);
                    new Notice('Password correct. Revealing content.');
                    this.revealContent();
                }
            } else {
                new Notice('Incorrect password. Try again.');
            }
        }).open();
    }

    onunload() {
        console.log('Unloading Password Protect Plugin');
    }
}
