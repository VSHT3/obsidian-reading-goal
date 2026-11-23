/** Shared progress-bar DOM, used by both blocks and the Bases view. */
import type { ReadingProgressSettings } from "./settings";

export interface BarOptions {
	fraction: number;
	complete: boolean;
	ariaLabel: string;
	valueNow: number;
	valueMax: number;
	/** Supplies the configured colours and height. */
	settings: Pick<ReadingProgressSettings, "barColor" | "completeColor" | "barHeight">;
	/** A block's own colour, used whether or not the bar is complete. */
	color?: string | null;
	/** A block's own height in pixels. */
	height?: number | null;
}

export function renderBar(parent: HTMLElement, options: BarOptions): HTMLElement {
	const { settings } = options;
	const track = parent.createDiv({ cls: "reading-progress-track" });
	track.setAttrs({
		role: "progressbar",
		"aria-valuemin": "0",
		"aria-valuemax": String(options.valueMax),
		"aria-valuenow": String(options.valueNow),
		"aria-label": options.ariaLabel,
	});
	track.style.height = `${options.height ?? settings.barHeight}px`;

	const fill = track.createDiv({ cls: "reading-progress-fill" });
	fill.style.width = `${(Math.min(Math.max(options.fraction, 0), 1) * 100).toFixed(2)}%`;
	if (options.complete) fill.addClass("is-complete");
	// An explicit colour is a deliberate override, so it wins over the
	// completion styling rather than being silently discarded.
	const color = options.color || (options.complete ? settings.completeColor : settings.barColor);
	if (color) fill.style.backgroundColor = color;

	return track;
}

/** Percentages below ten per cent still deserve a decimal digit. */
export function formatPercent(fraction: number): string {
	const percent = fraction * 100;
	if (percent > 0 && percent < 10) return `${percent.toFixed(1)}%`;
	return `${percent.toFixed(0)}%`;
}
