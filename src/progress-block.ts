import { MarkdownRenderChild, TFile } from "obsidian";
import type ReadingProgressPlugin from "./main";
import { formatPercent, renderBar } from "./bar";
import { progressOptions, type ProgressOptions } from "./block-options";
import { applyTemplate } from "./template";
import { movePosition, readBookState } from "./progress";

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
		root.empty();
		root.addClass("reading-progress");

		const file = this.target();
		if (!file) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: options.file
					? `Reading progress: no note named "${options.file}".`
					: "Reading progress: note not found.",
			});
			return;
		}

		const state = readBookState(this.plugin.app.metadataCache.getFileCache(file), settings);

		if (state.total === null || state.total === 0) {
			root.createDiv({
				cls: "reading-progress-empty",
				text: `Reading progress: set a numeric "${settings.pagesProperty}" property on ${file.basename}.`,
			});
			this.renderUnknown(root, options.unknown);
			return;
		}

		const complete = state.current >= state.total;
		const unknown = [...options.unknown];

		if (options.label.kind !== "hidden") {
			const prefix = options.file ? `${file.basename} \u2014 ` : "";
			let text: string;

			if (options.label.kind === "custom") {
				const applied = applyTemplate(options.label.template, {
					current: state.current.toLocaleString(),
					total: state.total.toLocaleString(),
					remaining: (state.total - state.current).toLocaleString(),
					percent: formatPercent(state.fraction),
					title: file.basename,
					status: state.status ?? "",
					words: (state.current * settings.wordsPerPage).toLocaleString(),
				});
				text = applied.text;
				unknown.push(...applied.unknown);
			} else {
				text = complete
					? `${prefix}Finished \u2014 all ${state.total.toLocaleString()} pages.`
					: `${prefix}Page ${state.current.toLocaleString()} of ${state.total.toLocaleString()}.`;
			}

			root.createDiv({ cls: "reading-progress-label", text });
		}

		renderBar(root, {
			fraction: state.fraction,
			complete,
			label: "",
			ariaLabel: `Reading progress for ${file.basename}`,
			valueNow: state.current,
			valueMax: state.total,
			color: options.color,
			height: options.height,
		});

		if (options.showPercentage) {
			root.createDiv({
				cls: "reading-progress-percent",
				text: formatPercent(state.fraction),
			});
		}

		if (options.showButtons) this.renderButtons(root, file, options);
		this.renderUnknown(root, unknown);
	}

	private renderButtons(root: HTMLElement, file: TFile, options: ProgressOptions): void {
		const { smallStep, largeStep } = options.settings;
		const steps: number[] = [];
		if (options.showMinus) steps.push(-largeStep, -smallStep);
		if (options.showPlus) steps.push(smallStep, largeStep);

		const unique = [...new Set(steps.filter((value) => value !== 0))];
		if (unique.length === 0) return;

		const row = root.createDiv({ cls: "reading-progress-buttons" });
		for (const step of unique) {
			const button = row.createEl("button", {
				text: step > 0 ? `+${step}` : String(step),
				cls: "reading-progress-button",
			});
			button.setAttr(
				"aria-label",
				`${step > 0 ? "Advance" : "Rewind"} ${Math.abs(step)} pages`,
			);
			this.registerDomEvent(button, "click", () => {
				void movePosition(this.plugin.app, file, step, options.settings);
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
