import { App, Modal, Setting, type Editor } from "obsidian";
import { NoteSuggest } from "./book-suggest";
import { isBookNote } from "./progress";
import type ReadingProgressPlugin from "./main";
import { GOAL_BLOCK, PROGRESS_BLOCK } from "./block-ids";

type BlockKind = "progress" | "goal";

interface Draft {
	kind: BlockKind;
	buttons: boolean;
	minus: boolean;
	percent: boolean;
	label: boolean;
	labelText: string;
	details: boolean;
	smallStep: number;
	largeStep: number;
	color: string;
	height: number;
	file: string;
	goal: number;
	tag: string;
	words: number;
	inProgress: boolean;
}

/**
 * Builds a block and inserts it at the cursor.
 *
 * Only options that differ from the current settings are written, so blocks
 * stay short and keep following the settings unless deliberately pinned.
 */
export class InsertBlockModal extends Modal {
	private readonly plugin: ReadingProgressPlugin;
	private readonly editor: Editor;
	private readonly draft: Draft;
	private previewEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;

	constructor(app: App, plugin: ReadingProgressPlugin, editor: Editor, kind: BlockKind) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;

		const s = plugin.settings;
		this.draft = {
			kind,
			buttons: s.showButtons,
			minus: s.showMinusButtons,
			percent: s.showPercentage,
			label: true,
			labelText: "",
			details: true,
			smallStep: s.smallStep,
			largeStep: s.largeStep,
			color: "",
			height: 0,
			file: "",
			goal: s.pageGoal,
			tag: s.bookTag,
			words: s.wordsPerPage,
			inProgress: s.countBooksInProgress,
		};
	}

	onOpen(): void {
		this.setTitle("Insert reading progress block");

		new Setting(this.contentEl)
			.setName("Block")
			.setDesc("A book's own progress, or the vault-wide goal.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("progress", "Book progress")
					.addOption("goal", "Vault goal")
					.setValue(this.draft.kind)
					.onChange((value) => {
						this.draft.kind = value as BlockKind;
						this.renderBody();
					}),
			);

		this.bodyEl = this.contentEl.createDiv();

		const previewWrap = this.contentEl.createDiv({ cls: "reading-progress-preview" });
		previewWrap.createEl("p", { text: "Will insert:", cls: "reading-progress-preview-caption" });
		this.previewEl = previewWrap.createEl("pre");

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText("Insert")
					.setCta()
					.onClick(() => {
						this.editor.replaceSelection(this.build());
						this.close();
					}),
			);

		this.renderBody();
	}

	private renderBody(): void {
		const body = this.bodyEl;
		if (!body) return;
		body.empty();

		const refresh = () => this.updatePreview();

		if (this.draft.kind === "progress") {
			new Setting(body)
				.setName("Buttons")
				.setDesc("Show the increment and decrement buttons.")
				.addToggle((t) =>
					t.setValue(this.draft.buttons).onChange((v) => {
						this.draft.buttons = v;
						refresh();
					}),
				);

			new Setting(body)
				.setName("Rewind buttons")
				.setDesc("Include the negative steps.")
				.addToggle((t) =>
					t.setValue(this.draft.minus).onChange((v) => {
						this.draft.minus = v;
						refresh();
					}),
				);

			new Setting(body).setName("Step sizes").addText((t) =>
				t
					.setPlaceholder("Small")
					.setValue(String(this.draft.smallStep))
					.onChange((v) => {
						this.draft.smallStep = Number.parseInt(v, 10) || this.plugin.settings.smallStep;
						refresh();
					}),
			).addText((t) =>
				t
					.setPlaceholder("Large")
					.setValue(String(this.draft.largeStep))
					.onChange((v) => {
						this.draft.largeStep = Number.parseInt(v, 10) || this.plugin.settings.largeStep;
						refresh();
					}),
			);

			new Setting(body)
				.setName("Another note")
				.setDesc("Leave empty to track the note this block sits in.")
				.addText((t) => {
					t.setPlaceholder("Search notes\u2026")
						.setValue(this.draft.file)
						.onChange((v) => {
							this.draft.file = v.trim();
							refresh();
						});
					const suggest = new NoteSuggest(this.app, t.inputEl, (file) =>
						isBookNote(this.app.metadataCache.getFileCache(file), this.plugin.settings),
					);
					suggest.onSelect((file) => {
						this.draft.file = file.basename;
						t.setValue(file.basename);
						suggest.close();
						refresh();
					});
				});
		} else {
			new Setting(body).setName("Page goal").addText((t) =>
				t.setValue(String(this.draft.goal)).onChange((v) => {
					this.draft.goal = Number.parseInt(v, 10) || this.plugin.settings.pageGoal;
					refresh();
				}),
			);

			new Setting(body).setName("Book tag").addText((t) =>
				t.setValue(this.draft.tag).onChange((v) => {
					this.draft.tag = v.trim() || this.plugin.settings.bookTag;
					refresh();
				}),
			);

			new Setting(body)
				.setName("Count books in progress")
				.addToggle((t) =>
					t.setValue(this.draft.inProgress).onChange((v) => {
						this.draft.inProgress = v;
						refresh();
					}),
				);

			new Setting(body)
				.setName("Details line")
				.setDesc("Counts of finished, in-progress and shelved books.")
				.addToggle((t) =>
					t.setValue(this.draft.details).onChange((v) => {
						this.draft.details = v;
						refresh();
					}),
				);
		}

		new Setting(body)
			.setName("Label")
			.setDesc("Turn off to show the bar alone.")
			.addToggle((t) =>
				t.setValue(this.draft.label).onChange((v) => {
					this.draft.label = v;
					this.renderBody();
				}),
			);

		if (this.draft.label) {
			const tokens =
				this.draft.kind === "progress"
					? "{current} {total} {remaining} {percent} {title} {status} {words}"
					: "{read} {goal} {remaining} {percent} {finished} {inprogress} {books} {words}";

			new Setting(body)
				.setName("Custom label")
				.setDesc(`Leave empty for the built-in wording. Available: ${tokens}`)
				.addText((t) =>
					t
						.setPlaceholder(
							this.draft.kind === "progress"
								? "Page {current} of {total} \u2014 {percent}"
								: "{read} of {goal} pages \u2014 {percent}",
						)
						.setValue(this.draft.labelText)
						.onChange((v) => {
							this.draft.labelText = v;
							refresh();
						}),
				);
		}

		new Setting(body).setName("Percentage").addToggle((t) =>
			t.setValue(this.draft.percent).onChange((v) => {
				this.draft.percent = v;
				refresh();
			}),
		);

		new Setting(body)
			.setName("Bar colour")
			.setDesc("Any CSS colour. Empty uses the theme accent.")
			.addText((t) =>
				t.setPlaceholder("#00A5FF").onChange((v) => {
					this.draft.color = v.trim();
					refresh();
				}),
			);

		new Setting(body)
			.setName("Bar height")
			.setDesc("Pixels. Zero uses the default.")
			.addText((t) =>
				t.setPlaceholder("10").onChange((v) => {
					this.draft.height = Number.parseInt(v, 10) || 0;
					refresh();
				}),
			);

		this.updatePreview();
	}

	private build(): string {
		const s = this.plugin.settings;
		const lines: string[] = [];
		const d = this.draft;

		if (d.kind === "progress") {
			if (d.file) lines.push(`file: ${d.file}`);
			if (d.buttons !== s.showButtons) lines.push(`buttons: ${d.buttons}`);
			if (d.minus !== s.showMinusButtons) lines.push(`minus: ${d.minus}`);
			if (d.smallStep !== s.smallStep) lines.push(`small: ${d.smallStep}`);
			if (d.largeStep !== s.largeStep) lines.push(`large: ${d.largeStep}`);
		} else {
			if (d.goal !== s.pageGoal) lines.push(`goal: ${d.goal}`);
			if (d.tag !== s.bookTag) lines.push(`tag: ${d.tag}`);
			if (d.inProgress !== s.countBooksInProgress) lines.push(`inprogress: ${d.inProgress}`);
			if (!d.details) lines.push("details: false");
		}

		if (!d.label) lines.push("label: false");
		else if (d.labelText.trim()) lines.push(`label: ${d.labelText.trim()}`);
		if (d.percent !== s.showPercentage) lines.push(`percent: ${d.percent}`);
		if (d.color) lines.push(`color: ${d.color}`);
		if (d.height > 0) lines.push(`height: ${d.height}`);

		const language = d.kind === "progress" ? PROGRESS_BLOCK : GOAL_BLOCK;
		return ["```" + language, ...lines, "```", ""].join("\n");
	}

	private updatePreview(): void {
		if (this.previewEl) this.previewEl.setText(this.build().trimEnd());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
