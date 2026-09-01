/** Shared progress-bar DOM, used by both blocks and the Bases view. */
export interface BarOptions {
	fraction: number;
	complete: boolean;
	label: string;
	ariaLabel: string;
	valueNow: number;
	valueMax: number;
	color?: string | null;
	height?: number | null;
}

export function renderBar(parent: HTMLElement, options: BarOptions): HTMLElement {
	const track = parent.createDiv({ cls: "reading-progress-track" });
	track.setAttrs({
		role: "progressbar",
		"aria-valuemin": "0",
		"aria-valuemax": String(options.valueMax),
		"aria-valuenow": String(options.valueNow),
		"aria-label": options.ariaLabel,
	});
	if (options.height) track.style.height = `${options.height}px`;

	const fill = track.createDiv({ cls: "reading-progress-fill" });
	fill.style.width = `${(Math.min(Math.max(options.fraction, 0), 1) * 100).toFixed(2)}%`;
	if (options.complete) fill.addClass("is-complete");
	// An explicit colour is a deliberate override, so it wins over the
	// completion styling rather than being silently discarded.
	if (options.color) fill.style.backgroundColor = options.color;

	return track;
}

/** Percentages below one per cent still deserve a visible digit. */
export function formatPercent(fraction: number): string {
	const percent = fraction * 100;
	if (percent > 0 && percent < 1) return `${percent.toFixed(1)}%`;
	if (percent > 0 && percent < 10) return `${percent.toFixed(1)}%`;
	return `${percent.toFixed(0)}%`;
}
