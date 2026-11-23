import { formatPercent } from "./bar";
import type { BookState } from "./progress";
import { applyTemplate, type TemplateResult } from "./template";

/** Placeholders a book label or the status bar format may use. */
export const PROGRESS_TOKENS = [
	"current",
	"total",
	"remaining",
	"percent",
	"title",
	"status",
	"words",
] as const;

/** Placeholders a goal label may use. */
export const GOAL_TOKENS = [
	"read",
	"goal",
	"remaining",
	"percent",
	"finished",
	"inprogress",
	"books",
	"rereads",
	"words",
	"deadline",
	"daysleft",
	"pace",
] as const;

export type ProgressTokens = Record<(typeof PROGRESS_TOKENS)[number], string>;
export type GoalTokens = Record<(typeof GOAL_TOKENS)[number], string>;

export function progressTokens(
	state: BookState,
	title: string,
	wordsPerPage: number,
): ProgressTokens {
	const total = state.total ?? 0;
	return {
		current: state.current.toLocaleString(),
		total: total.toLocaleString(),
		remaining: Math.max(total - state.current, 0).toLocaleString(),
		percent: formatPercent(state.fraction),
		title,
		status: state.status ?? "",
		words: (state.current * wordsPerPage).toLocaleString(),
	};
}

/**
 * The text above a book's bar: the template when there is one, otherwise the
 * built-in wording. `prefix` names the book when the bar tracks another note.
 */
export function progressLabel(
	template: string,
	state: BookState,
	title: string,
	wordsPerPage: number,
	prefix = "",
): TemplateResult {
	if (template.length > 0) {
		return applyTemplate(template, progressTokens(state, title, wordsPerPage));
	}
	const total = state.total ?? 0;
	return {
		unknown: [],
		text:
			state.current >= total
				? `${prefix}Finished \u2014 all ${total.toLocaleString()} pages.`
				: `${prefix}Page ${state.current.toLocaleString()} of ${total.toLocaleString()}.`,
	};
}

/** `{current} {total} …`, for showing which placeholders exist. */
export function tokenList(tokens: readonly string[]): string {
	return tokens.map((token) => `{${token}}`).join(" ");
}

/** The placeholders in a template that do not exist, for validating a setting. */
export function unknownTokens(template: string, tokens: readonly string[]): string[] {
	return applyTemplate(template, Object.fromEntries(tokens.map((token) => [token, ""]))).unknown;
}
