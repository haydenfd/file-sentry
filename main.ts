import { App, Modal, Notice, Plugin } from 'obsidian';

class PasswordModal extends Modal {
    private onSubmit: (password: string) => void;

    constructor(app: App, onSubmit: (password: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('password-modal');

        contentEl.createEl('h2', { text: 'Enter Password' });

        const inputEl = contentEl.createEl('input', {
            type: 'password',
            placeholder: 'Enter your password',
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
    async onload() {
        console.log('Loading Password Protect Plugin');

        // Add a ribbon icon to the left sidebar
        const ribbonIconEl = this.addRibbonIcon('lock', 'Password Protect', (evt: MouseEvent) => {
            // Open a modal when the icon is clicked
            new PasswordModal(this.app, (password) => {
                new Notice(`Password entered: ${password}`);
                // Add encryption logic here
            }).open();
        });

        // Perform additional things with the ribbon
        ribbonIconEl.addClass('password-protect-ribbon-class');
    }

    onunload() {
        console.log('Unloading Password Protect Plugin');
    }
}
