import { App, Modal, Setting, TFile } from "obsidian";
import { readBookState, trackBook } from "./progress";
import type { ReadingProgressSettings } from "./settings";

/** Asks for a book's length and position, then turns the note into a book. */
export class TrackBookModal extends Modal {
	private readonly file: TFile;
	private readonly settings: ReadingProgressSettings;

	constructor(app: App, file: TFile, settings: ReadingProgressSettings) {
		super(app);
		this.file = file;
		this.settings = settings;
	}

	onOpen(): void {
		const { contentEl, file, settings } = this;
		const state = readBookState(this.app.metadataCache.getFileCache(file), settings);

		this.setTitle(`Track ${file.basename} as a book`);

		let pages = "";
		let current = String(state.current);

		const submit = () => {
			const total = Number.parseInt(pages.trim(), 10);
			if (!Number.isFinite(total) || total < 1) return;
			const position = Number.parseInt(current.trim(), 10);
			this.close();
			void trackBook(
				this.app,
				file,
				total,
				Number.isFinite(position) ? position : 0,
				settings,
			);
		};

		const numeric = (el: HTMLInputElement) => {
			el.type = "number";
			el.min = "0";
			el.inputMode = "numeric";
			el.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && !event.isComposing) {
					event.preventDefault();
					submit();
				}
			});
		};

		new Setting(contentEl)
			.setName("Total pages")
			.setDesc(`Written to the "${settings.pagesProperty}" property.`)
			.addText((text) => {
				text.setPlaceholder("435").onChange((value) => {
					pages = value;
				});
				numeric(text.inputEl);
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.setName("Current page")
			.setDesc(`Written to the "${settings.currentPageProperty}" property.`)
			.addText((text) => {
				text.setValue(current).onChange((value) => {
					current = value;
				});
				numeric(text.inputEl);
			});

		contentEl.createDiv({
			cls: "reading-progress-modal-preview",
			text: `Also adds the #${settings.bookTag.replace(/^#/, "")} tag, so the book counts toward the goal.`,
		});

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) => button.setButtonText("Track").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
