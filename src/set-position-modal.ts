import { App, Modal, Setting, TFile } from "obsidian";
import { formatPercent } from "./bar";
import { finishBook, parsePositionInput, readBookState, writePosition } from "./progress";
import type { ReadingProgressSettings } from "./settings";

/**
 * Prompts for a new position and writes it.
 *
 * The field takes a page, a relative move or a percentage. The step buttons
 * exist for phones, whose numeric keyboard has no plus or per cent key.
 */
export class SetPositionModal extends Modal {
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
		const total = state.total ?? 0;
		const current = state.current;

		this.setTitle(file.basename);

		let input: HTMLInputElement | null = null;
		let preview: HTMLElement | null = null;
		const target = () => parsePositionInput(input?.value ?? "", current, total);

		const refresh = () => {
			const page = target();
			preview?.setText(
				page === null
					? "Enter a page number."
					: `Page ${page.toLocaleString()} of ${total.toLocaleString()} \u00b7 ${formatPercent(total > 0 ? page / total : 0)}`,
			);
			preview?.toggleClass("is-invalid", page === null);
		};

		const submit = () => {
			const page = target();
			if (page === null) return;
			this.close();
			void writePosition(this.app, file, page, settings);
		};

		new Setting(contentEl)
			.setName("Page")
			.setDesc("A page number, a move such as +15 or -5, or a percentage such as 40%.")
			.addText((text) => {
				input = text.inputEl;
				text.setValue(String(current)).onChange(refresh);
				input.inputMode = "numeric";
				input.enterKeyHint = "done";
				input.addEventListener("keydown", (event) => {
					if (event.key === "Enter" && !event.isComposing) {
						event.preventDefault();
						submit();
					}
				});
			});

		const steps = [...new Set([-settings.largeStep, -settings.smallStep, settings.smallStep, settings.largeStep])];
		const row = contentEl.createDiv({ cls: "reading-progress-buttons reading-progress-modal-steps" });
		for (const step of steps) {
			const button = row.createEl("button", {
				text: step > 0 ? `+${step}` : String(step),
				cls: "reading-progress-button",
			});
			button.addEventListener("click", () => {
				if (!input) return;
				const next = Math.min(Math.max((target() ?? current) + step, 0), total);
				input.value = String(next);
				refresh();
			});
		}

		preview = contentEl.createDiv({ cls: "reading-progress-modal-preview" });

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button.setButtonText("Mark finished").onClick(() => {
					this.close();
					void finishBook(this.app, file, settings);
				}),
			)
			.addButton((button) => button.setButtonText("Set").setCta().onClick(submit));

		refresh();
		// Focus after the modal has taken focus itself, or the selection is lost.
		window.setTimeout(() => {
			input?.focus();
			input?.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
