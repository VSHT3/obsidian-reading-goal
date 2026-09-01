import { BasesView, type QueryController } from "obsidian";
import type ReadingProgressPlugin from "./main";
import { formatPercent, renderBar } from "./bar";
import { readBookState } from "./progress";

export const BASES_VIEW_TYPE = "reading-progress";

/**
 * A Bases view that renders one progress bar per row.
 *
 * Bases owns the query, filtering, sorting and grouping; this only draws. Rows
 * read their state from the metadata cache rather than from Bases property
 * values, so the configured property names apply exactly as they do elsewhere
 * in the plugin.
 */
export class ReadingProgressBasesView extends BasesView {
	readonly type = BASES_VIEW_TYPE;

	private readonly plugin: ReadingProgressPlugin;
	private readonly rootEl: HTMLElement;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: ReadingProgressPlugin) {
		super(controller);
		this.plugin = plugin;
		this.rootEl = containerEl.createDiv({ cls: "reading-progress-bases" });
	}

	onDataUpdated(): void {
		const settings = this.plugin.settings;
		this.rootEl.empty();

		const groups = this.data.groupedData;
		let shownPages = 0;
		let shownTotal = 0;
		let rows = 0;

		for (const group of groups) {
			if (groups.length > 1) {
				this.rootEl.createDiv({
					cls: "reading-progress-bases-group",
					text: group.key?.toString() ?? "",
				});
			}

			for (const entry of group.entries) {
				const state = readBookState(
					this.app.metadataCache.getFileCache(entry.file),
					settings,
				);
				if (state.total === null || state.total === 0) continue;

				rows += 1;
				shownPages += state.current;
				shownTotal += state.total;

				const row = this.rootEl.createDiv({ cls: "reading-progress-bases-row" });

				const link = row.createEl("a", {
					cls: "internal-link reading-progress-bases-title",
					text: entry.file.basename,
				});
				link.dataset.href = entry.file.path;
				link.setAttr("href", entry.file.path);

				const barCell = row.createDiv({ cls: "reading-progress-bases-bar" });
				renderBar(barCell, {
					fraction: state.fraction,
					complete: state.current >= state.total,
					label: "",
					ariaLabel: `Reading progress for ${entry.file.basename}`,
					valueNow: state.current,
					valueMax: state.total,
				});

				row.createDiv({
					cls: "reading-progress-bases-count",
					text: `${state.current.toLocaleString()} / ${state.total.toLocaleString()}`,
				});
				row.createDiv({
					cls: "reading-progress-bases-percent",
					text: formatPercent(state.fraction),
				});
			}
		}

		if (rows === 0) {
			this.rootEl.createDiv({
				cls: "reading-progress-empty",
				text: `No rows with a numeric "${settings.pagesProperty}" property.`,
			});
			return;
		}

		this.rootEl.createDiv({
			cls: "reading-progress-bases-total",
			text: `${rows.toLocaleString()} books \u00b7 ${shownPages.toLocaleString()} of ${shownTotal.toLocaleString()} pages \u00b7 ${formatPercent(shownPages / shownTotal)}`,
		});
	}
}
