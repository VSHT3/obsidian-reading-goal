import type { ReadingProgressSettings } from "./settings";

/**
 * Options written inside a fenced block, as `key: value` lines.
 *
 * Unknown keys are collected so the block can tell the reader it ignored
 * something, rather than silently doing nothing.
 */
export interface ParsedOptions {
	values: Record<string, string>;
	unknown: string[];
}

export function parseOptions(source: string, known: readonly string[]): ParsedOptions {
	const values: Record<string, string> = {};
	const unknown: string[] = [];

	for (const rawLine of source.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;

		const separator = line.indexOf(":");
		if (separator === -1) {
			unknown.push(line);
			continue;
		}

		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (key.length === 0) continue;

		if (!known.includes(key)) {
			unknown.push(key);
			continue;
		}
		values[key] = value;
	}

	return { values, unknown };
}

function bool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	const normalised = value.toLowerCase();
	if (["true", "yes", "on", "1", "show"].includes(normalised)) return true;
	if (["false", "no", "off", "0", "hide"].includes(normalised)) return false;
	return fallback;
}

function count(value: string | undefined, fallback: number, min: number): number {
	if (value === undefined) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function text(value: string | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/**
 * A label is either hidden, the built-in wording, or a custom template.
 * `label: false` hides it; `label: Page {current}` supplies a template.
 */
export type LabelOption = { kind: "hidden" } | { kind: "default" } | { kind: "custom"; template: string };

function label(value: string | undefined): LabelOption {
	if (value === undefined) return { kind: "default" };
	const normalised = value.toLowerCase();
	if (["false", "no", "off", "0", "hide"].includes(normalised)) return { kind: "hidden" };
	if (["true", "yes", "on", "1", "show"].includes(normalised)) return { kind: "default" };
	return { kind: "custom", template: value };
}

/** Options shared by both block types. */
export interface SharedOptions {
	showPercentage: boolean;
	label: LabelOption;
	color: string | null;
	height: number | null;
}

export const PROGRESS_KEYS = [
	"pages",
	"current",
	"status",
	"small",
	"large",
	"buttons",
	"plus",
	"minus",
	"percent",
	"label",
	"color",
	"height",
	"file",
] as const;

export const GOAL_KEYS = [
	"goal",
	"tag",
	"words",
	"inprogress",
	"percent",
	"label",
	"color",
	"height",
	"details",
] as const;

export interface ProgressOptions extends SharedOptions {
	/** Settings with any per-block property and step overrides applied. */
	settings: ReadingProgressSettings;
	showButtons: boolean;
	/** Show the advance buttons. */
	showPlus: boolean;
	/** Show the rewind buttons. */
	showMinus: boolean;
	/** Render another note's progress instead of the host note's. */
	file: string | null;
	unknown: string[];
}

export function progressOptions(
	source: string,
	base: ReadingProgressSettings,
): ProgressOptions {
	const { values, unknown } = parseOptions(source, PROGRESS_KEYS);

	return {
		settings: {
			...base,
			pagesProperty: text(values.pages, base.pagesProperty),
			currentPageProperty: text(values.current, base.currentPageProperty),
			statusProperty: text(values.status, base.statusProperty),
			smallStep: count(values.small, base.smallStep, 1),
			largeStep: count(values.large, base.largeStep, 1),
		},
		showButtons: bool(values.buttons, base.showButtons),
		showPlus: bool(values.plus, true),
		showMinus: bool(values.minus, base.showMinusButtons),
		showPercentage: bool(values.percent, base.showPercentage),
		label: label(values.label),
		color: values.color ?? null,
		height: values.height === undefined ? null : count(values.height, 10, 1),
		file: values.file ?? null,
		unknown,
	};
}

export interface GoalOptions extends SharedOptions {
	settings: ReadingProgressSettings;
	showDetails: boolean;
	unknown: string[];
}

export function goalOptions(source: string, base: ReadingProgressSettings): GoalOptions {
	const { values, unknown } = parseOptions(source, GOAL_KEYS);

	return {
		settings: {
			...base,
			pageGoal: count(values.goal, base.pageGoal, 1),
			bookTag: text(values.tag, base.bookTag),
			wordsPerPage: count(values.words, base.wordsPerPage, 0),
			countBooksInProgress: bool(values.inprogress, base.countBooksInProgress),
		},
		showPercentage: bool(values.percent, base.showPercentage),
		label: label(values.label),
		showDetails: bool(values.details, true),
		color: values.color ?? null,
		height: values.height === undefined ? null : count(values.height, 10, 1),
		unknown,
	};
}
