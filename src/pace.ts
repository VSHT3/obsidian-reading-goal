/** Pace arithmetic, kept free of Obsidian so it can be tested directly. */

const DAY_MS = 86_400_000;

export interface GoalPace {
	/** Calendar days until the deadline. Negative once it has passed. */
	daysLeft: number;
	/** Pages still to read. */
	remaining: number;
	/** Pages a day needed to arrive on time. Zero when the goal is met. */
	perDay: number;
}

/** Parse a strict YYYY-MM-DD date at local midnight. */
export function parseDeadline(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(year, month - 1, day);
	// Reject overflow such as 2026-02-31, which Date silently rolls forward.
	return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * What it takes to reach the goal by the deadline.
 *
 * Today counts as a reading day, as does the deadline itself, so a deadline of
 * today leaves one day rather than none.
 */
export function goalPace(pagesRead: number, goal: number, deadline: Date, now: Date): GoalPace {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	// Rounded, because a daylight-saving change makes a day 23 or 25 hours.
	const daysLeft = Math.round((deadline.getTime() - today.getTime()) / DAY_MS);
	const remaining = Math.max(goal - pagesRead, 0);
	const perDay = daysLeft < 0 ? remaining : Math.ceil(remaining / (daysLeft + 1));
	return { daysLeft, remaining, perDay };
}

export function plural(value: number, unit: string): string {
	return `${value.toLocaleString()} ${unit}${value === 1 ? "" : "s"}`;
}

/** The line shown under an unmet goal that has a deadline. */
export function describeGoalPace(pace: GoalPace): string {
	if (pace.daysLeft < 0) {
		return `Deadline passed ${plural(-pace.daysLeft, "day")} ago \u00b7 ${plural(pace.remaining, "page")} short`;
	}
	if (pace.daysLeft === 0) return `Due today \u00b7 ${plural(pace.remaining, "page")} to go`;
	return `${plural(pace.daysLeft, "day")} left \u00b7 ${formatPerDay(pace.perDay)} to finish on time`;
}

export interface PacePoint {
	/** Whole days before today; zero is today. */
	daysAgo: number;
	page: number;
}

export interface BookPace {
	perDay: number;
	/** Days to the last page at this pace. */
	daysLeft: number;
}

/**
 * Estimate a reading pace from dated log entries.
 *
 * Only the current pass is considered: a re-read drops the page back to zero,
 * and averaging across that drop would produce a negative pace. The span runs
 * to today rather than to the last entry, so the estimate decays honestly when
 * the book has been sitting untouched.
 *
 * Returns null when there is not at least a day of history to measure.
 */
export function bookPace(
	points: readonly PacePoint[],
	current: number,
	total: number,
	windowDays = 30,
): BookPace | null {
	const ordered = [...points].sort((a, b) => b.daysAgo - a.daysAgo);

	let start = ordered.length - 1;
	while (start > 0 && ordered[start - 1].page <= ordered[start].page) start -= 1;

	const first = ordered
		.slice(Math.max(start, 0))
		.find((point) => point.daysAgo >= 0 && point.daysAgo <= windowDays);
	if (!first || first.daysAgo < 1) return null;

	const pages = current - first.page;
	if (pages <= 0) return null;

	const perDay = pages / first.daysAgo;
	return { perDay, daysLeft: Math.ceil(Math.max(total - current, 0) / perDay) };
}

export function formatPerDay(perDay: number): string {
	return `${plural(perDay < 10 ? Number(perDay.toFixed(1)) : Math.round(perDay), "page")} a day`;
}
