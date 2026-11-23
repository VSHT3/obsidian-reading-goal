import { MarkdownRenderChild, TFile, moment } from "obsidian";
import type ReadingProgressPlugin from "./main";
import { formatPercent, renderBar } from "./bar";
import { progressOptions, type ProgressOptions } from "./block-options";
import { readLog } from "./history";
import { bookPace, formatPerDay, plural } from "./pace";
import { progressLabel } from "./labels";
import { movePosition, readBookState, type BookState } from "./progress";
import { SetPositionModal } from "./set-position-modal";
import { TrackBookModal } from "./track-book-modal";

/**
 * The per-note progress bar.
 *
 * A code block processor runs once per section render and is not re-invoked
 * when frontmatter changes, because the block's own source text is untouched.
 * This child therefore subscribes to metadata updates for the file it tracks
 * and repaints itself, and is torn down automatically when its element leaves
 * the DOM.
 */
export class ProgressBlock extends MarkdownRenderChild {
	private readonly plugin: ReadingProgressPlugin;
	private readonly sourcePath: string;
	private readonly source: string;
	/** Bumped on every repaint, so a slow log read cannot fill a stale one. */
	private generation = 0;

	constructor(
		containerEl: HTMLElement,
		plugin: ReadingProgressPlugin,
		sourcePath: string,
		source: string,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.sourcePath = sourcePath;
		this.source = source;
	}

	onload(): void {
		this.registerEvent(
			this.plugin.app.metadataCache.on("changed", (file) => {
				if (file.path === this.target()?.path) this.render();
			}),
		);
		this.registerEvent(this.plugin.events.on("settings-changed", () => this.render()));
		this.render();
	}

	/** The note whose progress is shown: the host note unless `file:` overrides it. */
	private target(): TFile | null {
		const options = progressOptions(this.source, this.plugin.settings);
		if (options.file) {
			return this.plugin.app.metadataCache.getFirstLinkpathDest(
				options.file.replace(/^\[\[|\]\]$/g, ""),
				this.sourcePath,
			);
		}
		const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
		return file instanceof TFile ? file : null;
	}

	private render(): void {
		const options = progressOptions(this.source, this.plugin.settings);
		const settings = options.settings;
		const root = this.containerEl;
		const generation = ++this.generation;
		root.empty();
		root.addClass("reading-progress");

		const file = this.target();
		if (!file) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: options.file
					? `Reading Goal: no note named "${options.file}".`
					: "Reading Goal: note not found.",
			});
			return;
		}

		const state = readBookState(this.plugin.app.metadataCache.getFileCache(file), settings);
		const total = state.total;

		if (total === null || total === 0) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: `${file.basename} has no numeric "${settings.pagesProperty}" property yet.`,
			});
			const setup = root
				.createDiv({ cls: "reading-progress-buttons" })
				.createEl("button", { text: "Set up as a book", cls: "reading-progress-button" });
			this.registerDomEvent(setup, "click", () => {
				new TrackBookModal(this.plugin.app, file, settings).open();
			});
			this.renderUnknown(root, options.unknown);
			return;
		}

		const complete = state.current >= total;
		const unknown = [...options.unknown];

		if (options.label.kind !== "hidden") {
			// A block's own label wins; otherwise the template from settings,
			// and the built-in wording when that is empty too.
			const applied = progressLabel(
				options.label.kind === "custom" ? options.label.template : settings.progressLabel,
				state,
				file.basename,
				settings.wordsPerPage,
				options.file ? `${file.basename} \u2014 ` : "",
			);
			unknown.push(...applied.unknown);

			root.createDiv({ cls: "reading-progress-label", text: applied.text });
		}

		renderBar(root, {
			fraction: state.fraction,
			complete,
			ariaLabel: `Reading progress for ${file.basename}`,
			valueNow: state.current,
			valueMax: total,
			settings,
			color: options.color,
			height: options.height,
		});

		if (options.showPercentage) {
			root.createDiv({
				cls: "reading-progress-percent",
				text: formatPercent(state.fraction),
			});
		}

		if (options.showPace && settings.enableHistory && !complete && state.current > 0) {
			const paceEl = root.createDiv({ cls: "reading-progress-meta" });
			paceEl.hide();
			void this.renderPace(paceEl, file, state, total, options, generation);
		}

		if (options.showButtons) this.renderButtons(root, file, options);
		this.renderUnknown(root, unknown);
	}

	/** Fill in the pace line from the note's reading log, when it has enough history. */
	private async renderPace(
		el: HTMLElement,
		file: TFile,
		state: BookState,
		total: number,
		options: ProgressOptions,
		generation: number,
	): Promise<void> {
		const { historyHeading, historyDateFormat } = options.settings;
		const content = await this.plugin.app.vault.cachedRead(file);
		if (generation !== this.generation) return;

		const today = moment().startOf("day");
		const points = readLog(content, historyHeading).flatMap((entry) => {
			const date = moment(entry.date, historyDateFormat, true);
			return date.isValid()
				? [{ daysAgo: today.diff(date.startOf("day"), "days"), page: entry.page }]
				: [];
		});

		const pace = bookPace(points, state.current, total, options.settings.paceWindowDays);
		if (!pace) return;

		el.setText(
			`About ${formatPerDay(pace.perDay)} \u00b7 ${plural(pace.daysLeft, "day")} left at this pace`,
		);
		el.show();
	}

	private renderButtons(root: HTMLElement, file: TFile, options: ProgressOptions): void {
		const { smallStep, largeStep } = options.settings;
		const steps: number[] = [];
		if (options.showMinus) steps.push(-largeStep, -smallStep);
		if (options.showPlus) steps.push(smallStep, largeStep);

		const unique = [...new Set(steps.filter((value) => value !== 0))];
		if (unique.length === 0 && !options.showSet) return;

		const row = root.createDiv({ cls: "reading-progress-buttons" });
		for (const step of unique) {
			const button = row.createEl("button", {
				text: step > 0 ? `+${step}` : String(step),
				cls: "reading-progress-button",
			});
			button.setAttr(
				"aria-label",
				`${step > 0 ? "Advance" : "Rewind"} ${plural(Math.abs(step), "page")}`,
			);
			this.registerDomEvent(button, "click", () => {
				void movePosition(this.plugin.app, file, step, options.settings);
			});
		}

		if (options.showSet) {
			const button = row.createEl("button", {
				text: "Page\u2026",
				cls: "reading-progress-button",
			});
			button.setAttr("aria-label", "Set position to a specific page");
			this.registerDomEvent(button, "click", () => {
				new SetPositionModal(this.plugin.app, file, options.settings).open();
			});
		}
	}

	private renderUnknown(root: HTMLElement, unknown: string[]): void {
		if (unknown.length === 0) return;
		root.createDiv({
			cls: "reading-progress-empty",
			text: `Ignored unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`,
		});
	}
}
