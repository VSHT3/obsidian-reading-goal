import { MarkdownRenderChild, debounce } from "obsidian";
import type ReadingProgressPlugin from "./main";
import { formatPercent, renderBar } from "./bar";
import { goalOptions } from "./block-options";
import { collectGoalTotals } from "./progress";
import { applyTemplate } from "./template";

/**
 * The vault-wide goal bar.
 *
 * Recomputation walks every markdown file, so it is debounced: the metadata
 * cache emits a change per reindexed file, and a large vault reindexes in
 * bursts.
 */
export class GoalBlock extends MarkdownRenderChild {
	private readonly plugin: ReadingProgressPlugin;
	private readonly source: string;
	private readonly scheduleRender: () => void;

	constructor(containerEl: HTMLElement, plugin: ReadingProgressPlugin, source: string) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.scheduleRender = debounce(() => this.render(), 400, true);
	}

	onload(): void {
		this.registerEvent(this.plugin.app.metadataCache.on("changed", this.scheduleRender));
		this.registerEvent(this.plugin.app.metadataCache.on("resolved", this.scheduleRender));
		this.registerEvent(this.plugin.events.on("settings-changed", () => this.render()));
		this.render();
	}

	private render(): void {
		const options = goalOptions(this.source, this.plugin.settings);
		const settings = options.settings;
		const root = this.containerEl;
		root.empty();
		root.addClass("reading-progress", "reading-progress-goal");

		const totals = collectGoalTotals(this.plugin.app, settings);
		const goal = settings.pageGoal;

		if (goal <= 0) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: "Reading progress: set a page goal in the plugin settings, or with a goal option in this block.",
			});
			return;
		}

		const fraction = totals.pagesRead / goal;
		const reached = totals.pagesRead >= goal;

		const unknown = [...options.unknown];

		if (options.label.kind !== "hidden") {
			let text: string;

			if (options.label.kind === "custom") {
				const applied = applyTemplate(options.label.template, {
					read: totals.pagesRead.toLocaleString(),
					goal: goal.toLocaleString(),
					remaining: Math.max(goal - totals.pagesRead, 0).toLocaleString(),
					percent: formatPercent(fraction),
					finished: totals.booksFinished.toLocaleString(),
					inprogress: totals.booksInProgress.toLocaleString(),
					books: totals.booksTotal.toLocaleString(),
					rereads: totals.rereads.toLocaleString(),
					words: (totals.pagesRead * settings.wordsPerPage).toLocaleString(),
				});
				text = applied.text;
				unknown.push(...applied.unknown);
			} else {
				text = reached
					? `Goal reached \u2014 ${totals.pagesRead.toLocaleString()} of ${goal.toLocaleString()} pages.`
					: `${totals.pagesRead.toLocaleString()} of ${goal.toLocaleString()} pages.`;
			}

			root.createDiv({ cls: "reading-progress-label", text });
		}

		renderBar(root, {
			fraction,
			complete: reached,
			label: "",
			ariaLabel: "Progress toward page goal",
			valueNow: totals.pagesRead,
			valueMax: goal,
			color: options.color,
			height: options.height,
		});

		if (options.showPercentage) {
			root.createDiv({ cls: "reading-progress-percent", text: formatPercent(fraction) });
		}

		if (options.showDetails) {
			const parts = [
				`${totals.booksFinished.toLocaleString()} finished`,
				`${totals.booksInProgress.toLocaleString()} in progress`,
				`${totals.booksTotal.toLocaleString()} on the shelf`,
			];
			if (settings.countRereads && totals.rereads > 0) {
				const label = totals.rereads === 1 ? "re-read" : "re-reads";
				parts.push(`${totals.rereads.toLocaleString()} ${label}`);
			}
			if (settings.wordsPerPage > 0) {
				parts.push(`~${(totals.pagesRead * settings.wordsPerPage).toLocaleString()} words`);
			}
			root.createDiv({ cls: "reading-progress-meta", text: parts.join(" \u00b7 ") });

			if (!settings.countBooksInProgress && totals.booksInProgress > 0) {
				root.createDiv({
					cls: "reading-progress-meta",
					text: "Pages from unfinished books are excluded.",
				});
			}
		}

		if (unknown.length > 0) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: `Ignored unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`,
			});
		}
	}
}
