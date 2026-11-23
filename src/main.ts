import {
	Events,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	TFile,
	normalizePath,
	setIcon,
} from "obsidian";
import { formatPercent } from "./bar";
import { GoalBlock } from "./goal-block";
import { ProgressBlock } from "./progress-block";
import { GOAL_BLOCK, PROGRESS_BLOCK } from "./block-ids";
import { BASES_VIEW_TYPE, ReadingProgressBasesView } from "./bases-view";
import { baseTemplate } from "./base-template";
import { progressTokens } from "./labels";
import { applyTemplate } from "./template";
import { BookPickerModal } from "./book-picker";
import { InsertBlockModal } from "./insert-modal";
import { describeGoalPace, goalPace, parseDeadline, plural } from "./pace";
import {
	collectGoalTotals,
	finishBook,
	isTrackable,
	movePosition,
	readBookState,
	startReread,
} from "./progress";
import { SetPositionModal } from "./set-position-modal";
import { ReadingProgressSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type ReadingProgressSettings } from "./settings";
import { TrackBookModal } from "./track-book-modal";

export { GOAL_BLOCK, PROGRESS_BLOCK };

export default class ReadingProgressPlugin extends Plugin {
	settings: ReadingProgressSettings = DEFAULT_SETTINGS;

	/** Lets rendered blocks repaint when settings change. */
	readonly events = new Events();

	/** False when Bases is disabled in this vault. */
	basesAvailable = false;

	private statusBarEl: HTMLElement | null = null;

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
		this.registerStatusBar();

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !this.isBook(file)) return;
				menu.addItem((item) =>
					item
						.setTitle("Set reading position\u2026")
						.setIcon("book-open")
						.onClick(() => this.promptPosition(file)),
				);
			}),
		);

		this.addRibbonIcon("book-open", "Reading goal", (event) => this.showMenu(event));

		this.addSettingTab(new ReadingProgressSettingTab(this.app, this));
	}

	/** Whether the position commands can act on this file. */
	private isBook(file: TFile | null): file is TFile {
		return (
			file !== null &&
			file.extension === "md" &&
			isTrackable(this.app.metadataCache.getFileCache(file), this.settings)
		);
	}

	private promptPosition(file: TFile): void {
		new SetPositionModal(this.app, file, this.settings).open();
	}

	private pickBook(placeholder: string, onChoose: (file: TFile) => void): void {
		new BookPickerModal(this.app, this.settings, placeholder, onChoose).open();
	}

	private async reread(file: TFile): Promise<void> {
		const passes = await startReread(this.app, file, this.settings);
		if (passes !== null) {
			new Notice(`${file.basename}: starting pass ${passes + 1}, back to page 0.`, 5000);
		}
	}

	/** The vault total in two lines, plus the deadline line when one applies. */
	private goalSummary(): string[] {
		const { pageGoal, goalDeadline } = this.settings;
		const totals = collectGoalTotals(this.app, this.settings);
		const lines = [
			`${totals.pagesRead.toLocaleString()} of ${pageGoal.toLocaleString()} pages (${formatPercent(pageGoal > 0 ? totals.pagesRead / pageGoal : 0)})`,
			`${totals.booksFinished} finished \u00b7 ${totals.booksInProgress} in progress \u00b7 ${totals.booksTotal} on the shelf`,
		];

		const deadline = parseDeadline(goalDeadline);
		if (deadline && totals.pagesRead < pageGoal) {
			lines.push(describeGoalPace(goalPace(totals.pagesRead, pageGoal, deadline, new Date())));
		}
		return lines;
	}

	/**
	 * The ribbon menu, top to bottom: where the goal stands, what can be done
	 * to the note in view, what can be done to any book, then setup.
	 */
	private showMenu(event: MouseEvent): void {
		const menu = new Menu();
		const add = (title: string, icon: string, onClick: () => void, enabled = true) =>
			menu.addItem((item) =>
				item.setTitle(title).setIcon(icon).setDisabled(!enabled).onClick(onClick),
			);

		const [headline, ...details] = this.goalSummary();
		menu.addItem((item) => item.setTitle(headline).setIcon("target").setDisabled(true));
		for (const line of details) {
			menu.addItem((item) => item.setTitle(line).setDisabled(true));
		}
		menu.addSeparator();

		const active = this.app.workspace.getActiveFile();
		const book = this.isBook(active) ? active : null;
		if (book) {
			const state = readBookState(this.app.metadataCache.getFileCache(book), this.settings);
			const complete = state.total !== null && state.current >= state.total;
			const { smallStep, largeStep } = this.settings;

			menu.addItem((item) =>
				item
					.setTitle(
						`${book.basename} \u2014 page ${state.current.toLocaleString()} of ${(state.total ?? 0).toLocaleString()}`,
					)
					.setDisabled(true),
			);
			if (complete) {
				add("Start a re-read", "rotate-ccw", () => void this.reread(book));
			} else {
				for (const step of new Set([smallStep, largeStep])) {
					add(`Advance ${plural(step, "page")}`, "plus", () => {
						void movePosition(this.app, book, step, this.settings);
					});
				}
				add("Mark as finished", "check", () => {
					void finishBook(this.app, book, this.settings);
				});
			}
			add("Set page\u2026", "pencil", () => this.promptPosition(book));
			menu.addSeparator();
		} else if (active?.extension === "md") {
			add(`Track ${active.basename} as a book\u2026`, "book-plus", () => {
				new TrackBookModal(this.app, active, this.settings).open();
			});
			menu.addSeparator();
		}

		add("Update a book\u2026", "bookmark", () => this.updateAnyBook());
		add("Open a book\u2026", "library", () => this.openAnyBook());
		menu.addSeparator();

		const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		add(
			"Insert book progress block",
			"plus-square",
			() => {
				if (editor) new InsertBlockModal(this.app, this, editor, "progress").open();
			},
			editor !== undefined,
		);
		add(
			"Insert goal block",
			"plus-square",
			() => {
				if (editor) new InsertBlockModal(this.app, this, editor, "goal").open();
			},
			editor !== undefined,
		);
		add(
			this.app.vault.getFileByPath(this.basePath()) ? "Open books base" : "Create books base",
			"layout-list",
			() => void this.createBase(),
		);
		menu.addSeparator();
		add("Settings", "settings", () => {
			// The settings modal is not in the public API, but is stable.
			const { setting } = this.app as typeof this.app & {
				setting: { open(): void; openTabById(id: string): void };
			};
			setting.open();
			setting.openTabById(this.manifest.id);
		});

		menu.showAtMouseEvent(event);
	}

	private updateAnyBook(): void {
		this.pickBook("Update which book?", (file) => this.promptPosition(file));
	}

	private openAnyBook(): void {
		this.pickBook("Open which book?", (file) => {
			void this.app.workspace.getLeaf(false).openFile(file);
		});
	}

	/**
	 * The active book's position in the status bar, so a hotkey press has
	 * visible feedback even when the note's progress block is scrolled away.
	 */
	private registerStatusBar(): void {
		const el = this.addStatusBarItem();
		el.addClass("mod-clickable", "reading-progress-status");
		el.setAttr("aria-label", "Set reading position");
		this.statusBarEl = el;

		this.registerDomEvent(el, "click", () => {
			const file = this.app.workspace.getActiveFile();
			if (this.isBook(file)) this.promptPosition(file);
		});
		this.registerEvent(this.app.workspace.on("file-open", () => this.refreshStatusBar()));
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file === this.app.workspace.getActiveFile()) this.refreshStatusBar();
			}),
		);
		this.registerEvent(this.events.on("settings-changed", () => this.refreshStatusBar()));
		this.app.workspace.onLayoutReady(() => this.refreshStatusBar());
	}

	private refreshStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;

		const file = this.app.workspace.getActiveFile();
		if (!this.settings.showStatusBar || !this.isBook(file)) {
			el.hide();
			return;
		}

		const state = readBookState(this.app.metadataCache.getFileCache(file), this.settings);
		el.empty();
		setIcon(el.createSpan({ cls: "status-bar-item-icon" }), "book-open");
		el.createSpan({
			text: applyTemplate(
				this.settings.statusBarFormat,
				progressTokens(state, file.basename, this.settings.wordsPerPage),
			).text,
		});
		el.show();
	}

	private basePath(): string {
		return normalizePath(this.settings.basePath);
	}

	/** Write the bundled Base, generated against the configured property names. */
	private async createBase(): Promise<void> {
		const path = this.basePath();
		const existing = this.app.vault.getFileByPath(path);

		if (existing) {
			await this.app.workspace.getLeaf(false).openFile(existing);
			return;
		}

		try {
			const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
			if (folder.length > 0 && !this.app.vault.getFolderByPath(folder)) {
				await this.app.vault.createFolder(folder);
			}
			const file = await this.app.vault.create(path, baseTemplate(this.settings));
			if (!this.basesAvailable) {
				new Notice(`Created ${path}, but Bases is disabled in this vault.`, 6000);
			}
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			new Notice(`Reading Goal: could not create ${path}.\n\n${String(error)}`, 8000);
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
				this.withBook(checking, (file) => this.promptPosition(file)),
		});

		this.addCommand({
			id: "mark-finished",
			name: "Mark book as finished",
			checkCallback: (checking) =>
				this.withBook(checking, (file) => finishBook(this.app, file, this.settings)),
		});

		this.addCommand({
			id: "start-reread",
			name: "Start a re-read",
			checkCallback: (checking) => this.withBook(checking, (file) => this.reread(file)),
		});

		this.addCommand({
			id: "update-book",
			name: "Update position for any book",
			callback: () => this.updateAnyBook(),
		});

		this.addCommand({
			id: "open-book",
			name: "Open a book",
			callback: () => this.openAnyBook(),
		});

		this.addCommand({
			id: "track-note",
			name: "Track this note as a book",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md" || this.isBook(file)) return false;
				if (!checking) new TrackBookModal(this.app, file, this.settings).open();
				return true;
			},
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
				new Notice(this.goalSummary().join("\n"), 6000);
			},
		});
	}

	/**
	 * Shared gate for the position commands: they appear in the palette only
	 * when the active note is a book with a usable page count.
	 */
	private withBook(checking: boolean, run: (file: TFile) => unknown): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!this.isBook(file)) return false;
		if (!checking) void run(file);
		return true;
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<ReadingProgressSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.events.trigger("settings-changed");
	}
}
