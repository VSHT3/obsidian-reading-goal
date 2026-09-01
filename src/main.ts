import { Events, MarkdownView, Menu, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { GoalBlock } from "./goal-block";
import { ProgressBlock } from "./progress-block";
import { GOAL_BLOCK, PROGRESS_BLOCK } from "./block-ids";
import { BASES_VIEW_TYPE, ReadingProgressBasesView } from "./bases-view";
import { baseTemplate } from "./base-template";
import { InsertBlockModal } from "./insert-modal";
import {
	collectGoalTotals,
	finishBook,
	isTrackable,
	movePosition,
	readBookState,
	writePosition,
} from "./progress";
import { SetPositionModal } from "./set-position-modal";
import { ReadingProgressSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type ReadingProgressSettings } from "./settings";

export { GOAL_BLOCK, PROGRESS_BLOCK };

export default class ReadingProgressPlugin extends Plugin {
	settings: ReadingProgressSettings = DEFAULT_SETTINGS;

	/** Lets rendered blocks repaint when settings change. */
	readonly events = new Events();

	/** False when Bases is disabled in this vault. */
	basesAvailable = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor(PROGRESS_BLOCK, (source, el, ctx) => {
			ctx.addChild(new ProgressBlock(el, this, ctx.sourcePath, source));
		});

		this.registerMarkdownCodeBlockProcessor(GOAL_BLOCK, (source, el, ctx) => {
			ctx.addChild(new GoalBlock(el, this, source));
		});

		this.basesAvailable = this.registerBasesView(BASES_VIEW_TYPE, {
			name: "Reading progress",
			icon: "book-open",
			factory: (controller, containerEl) =>
				new ReadingProgressBasesView(controller, containerEl, this),
		});

		this.registerCommands();

		this.addRibbonIcon("book-open", "Reading progress", (event) => this.showMenu(event));

		this.addSettingTab(new ReadingProgressSettingTab(this.app, this));
	}

	private showMenu(event: MouseEvent): void {
		const menu = new Menu();
		const totals = collectGoalTotals(this.app, this.settings);
		const percent =
			this.settings.pageGoal > 0 ? (totals.pagesRead / this.settings.pageGoal) * 100 : 0;

		menu.addItem((item) =>
			item
				.setTitle(
					`${totals.pagesRead.toLocaleString()} of ${this.settings.pageGoal.toLocaleString()} pages (${percent.toFixed(1)}%)`,
				)
				.setIcon("target")
				.setDisabled(true),
		);
		menu.addItem((item) =>
			item
				.setTitle(
					`${totals.booksFinished} finished \u00b7 ${totals.booksInProgress} in progress \u00b7 ${totals.booksTotal} on the shelf`,
				)
				.setDisabled(true),
		);
		menu.addSeparator();

		const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		menu.addItem((item) =>
			item
				.setTitle("Insert block at cursor")
				.setIcon("plus")
				.setDisabled(!editor)
				.onClick(() => {
					if (editor) new InsertBlockModal(this.app, this, editor, "progress").open();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle("Create books base")
				.setIcon("layout-list")
				.onClick(() => void this.createBase()),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Settings")
				.setIcon("settings")
				.onClick(() => {
					// @ts-expect-error setting is not in the public API but is stable
					this.app.setting.open();
					// @ts-expect-error as above
					this.app.setting.openTabById(this.manifest.id);
				}),
		);

		menu.showAtMouseEvent(event);
	}

	/** Write the bundled Base, generated against the configured property names. */
	private async createBase(): Promise<void> {
		const path = normalizePath("Books.base");
		const existing = this.app.vault.getAbstractFileByPath(path);

		if (existing instanceof TFile) {
			new Notice("Books.base already exists. Opening it.");
			await this.app.workspace.getLeaf(false).openFile(existing);
			return;
		}

		try {
			const file = await this.app.vault.create(path, baseTemplate(this.settings));
			if (!this.basesAvailable) {
				new Notice("Created Books.base, but Bases is disabled in this vault.", 6000);
			}
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			new Notice(`Reading progress: could not create Books.base.\n\n${String(error)}`, 8000);
			console.error(error);
		}
	}

	private registerCommands(): void {
		const step = (id: string, name: string, delta: () => number) =>
			this.addCommand({
				id,
				name,
				repeatable: true,
				checkCallback: (checking) =>
					this.withBook(checking, (file) =>
						movePosition(this.app, file, delta(), this.settings),
					),
			});

		step("advance-small", "Advance position by small step", () => this.settings.smallStep);
		step("rewind-small", "Rewind position by small step", () => -this.settings.smallStep);
		step("advance-large", "Advance position by large step", () => this.settings.largeStep);
		step("rewind-large", "Rewind position by large step", () => -this.settings.largeStep);

		this.addCommand({
			id: "set-position",
			name: "Set position to a specific page",
			checkCallback: (checking) =>
				this.withBook(checking, (file) => {
					const state = readBookState(
						this.app.metadataCache.getFileCache(file),
						this.settings,
					);
					new SetPositionModal(this.app, file, state.current, state.total ?? 0, (page) =>
						void writePosition(this.app, file, page, this.settings),
					).open();
				}),
		});

		this.addCommand({
			id: "mark-finished",
			name: "Mark book as finished",
			checkCallback: (checking) =>
				this.withBook(checking, (file) => finishBook(this.app, file, this.settings)),
		});

		this.addCommand({
			id: "insert-progress-block",
			name: "Insert book progress block",
			editorCallback: (editor) =>
				new InsertBlockModal(this.app, this, editor, "progress").open(),
		});

		this.addCommand({
			id: "insert-goal-block",
			name: "Insert vault goal block",
			editorCallback: (editor) => new InsertBlockModal(this.app, this, editor, "goal").open(),
		});

		this.addCommand({
			id: "create-base",
			name: "Create books base",
			callback: () => void this.createBase(),
		});

		this.addCommand({
			id: "show-goal",
			name: "Show progress toward page goal",
			callback: () => {
				const totals = collectGoalTotals(this.app, this.settings);
				const percent =
					this.settings.pageGoal > 0
						? (totals.pagesRead / this.settings.pageGoal) * 100
						: 0;
				new Notice(
					`${totals.pagesRead.toLocaleString()} of ${this.settings.pageGoal.toLocaleString()} pages (${percent.toFixed(1)}%)\n` +
						`${totals.booksFinished} finished \u00b7 ${totals.booksInProgress} in progress`,
					6000,
				);
			},
		});
	}

	/**
	 * Shared gate for the position commands: they appear in the palette only
	 * when the active note is a book with a usable page count.
	 */
	private withBook(checking: boolean, run: (file: TFile) => unknown): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return false;
		if (!isTrackable(this.app.metadataCache.getFileCache(file), this.settings)) return false;
		if (!checking) void run(file);
		return true;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.events.trigger("settings-changed");
	}
}
