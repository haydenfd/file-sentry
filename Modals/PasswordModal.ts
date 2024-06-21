import { Modal, App } from "obsidian";
import * as Types from '../_types';

export class PasswordModal extends Modal {

    private onSubmit: Types.SubmitPasswordFunction;
    constructor(app: App, onSubmit: Types.SubmitPasswordFunction) {
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
