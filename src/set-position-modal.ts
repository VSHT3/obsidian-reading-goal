import { App, Modal, Setting, TFile } from "obsidian";

/** Prompts for an absolute page number. */
export class SetPositionModal extends Modal {
	private value: string;
	private readonly total: number;
	private readonly file: TFile;
	private readonly onSubmit: (page: number) => void;

	constructor(
		app: App,
		file: TFile,
		current: number,
		total: number,
		onSubmit: (page: number) => void,
	) {
		super(app);
		this.file = file;
		this.total = total;
		this.value = String(current);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(`Set reading position — ${this.file.basename}`);

		let submitted = false;
		const submit = () => {
			const parsed = Number.parseInt(this.value.trim(), 10);
			if (!Number.isFinite(parsed)) return;
			submitted = true;
			this.close();
			this.onSubmit(parsed);
		};

		new Setting(contentEl)
			.setName("Page")
			.setDesc(`Between 0 and ${this.total.toLocaleString()}.`)
			.addText((text) => {
				text.setValue(this.value).onChange((value) => {
					this.value = value;
				});
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = String(this.total);
				text.inputEl.focus();
				text.inputEl.select();
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						submit();
					}
				});
			});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button.setButtonText("Set").setCta().onClick(() => {
					if (!submitted) submit();
				}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
