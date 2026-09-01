import { App, CachedMetadata, Notice, TFile, getAllTags } from "obsidian";
import type { ReadingProgressSettings } from "./settings";

/** A book note's reading state, as derived from its frontmatter. */
export interface BookState {
	/** Total length, or null when the note does not declare a usable page count. */
	total: number | null;
	/** Current position. Absent or unparseable values read as 0. */
	current: number;
	/** Raw status value, if any. */
	status: string | null;
	/** Fraction read in [0, 1]. Zero when the total is unknown. */
	fraction: number;
}

/**
 * Coerce a frontmatter value to a non-negative integer.
 * Obsidian stores number properties as numbers, but hand-edited YAML and
 * imported notes routinely produce numeric strings such as "435".
 */
function toCount(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
	}
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value.trim());
		return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
	}
	return null;
}

export function readBookState(
	cache: CachedMetadata | null,
	settings: ReadingProgressSettings,
): BookState {
	const frontmatter = cache?.frontmatter;
	const total = toCount(frontmatter?.[settings.pagesProperty]);
	const current = toCount(frontmatter?.[settings.currentPageProperty]) ?? 0;
	const rawStatus = frontmatter?.[settings.statusProperty];

	const bounded = total !== null && total > 0 ? Math.min(current, total) : current;
	const fraction = total !== null && total > 0 ? bounded / total : 0;

	return {
		total,
		current: bounded,
		status: typeof rawStatus === "string" ? rawStatus : null,
		fraction,
	};
}

/** Whether a note is a book, i.e. carries the configured tag. */
export function isBookNote(
	cache: CachedMetadata | null,
	settings: ReadingProgressSettings,
): boolean {
	if (!cache) return false;
	const wanted = settings.bookTag.replace(/^#/, "").toLowerCase();
	if (wanted.length === 0) return false;
	const tags = getAllTags(cache);
	if (!tags) return false;
	return tags.some((tag) => tag.replace(/^#/, "").toLowerCase() === wanted);
}

/**
 * Whether the note carries enough information for the progress commands to act
 * on it. A page count is required; without one there is nothing to clamp to.
 */
export function isTrackable(
	cache: CachedMetadata | null,
	settings: ReadingProgressSettings,
): boolean {
	const frontmatter = cache?.frontmatter;
	if (!frontmatter) return false;
	const total = toCount(frontmatter[settings.pagesProperty]);
	return total !== null && total > 0;
}

/**
 * Apply a new position to a note, clamped to the book's length, updating the
 * status property when the book starts or completes.
 *
 * The next position is resolved inside the frontmatter transaction rather than
 * from the metadata cache, because the cache lags writes. Resolving outside
 * would make rapid relative moves — holding a repeatable hotkey, or clicking a
 * button faster than the vault reindexes — all read the same stale page and
 * collapse into a single step.
 *
 * Returns the position actually written, or null when the write was refused.
 */
async function applyPosition(
	app: App,
	file: TFile,
	resolve: (current: number, total: number | null) => number,
	settings: ReadingProgressSettings,
): Promise<number | null> {
	let written: number | null = null;

	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const total = toCount(frontmatter[settings.pagesProperty]);
			const current = toCount(frontmatter[settings.currentPageProperty]) ?? 0;
			const upper = total !== null && total > 0 ? total : Number.MAX_SAFE_INTEGER;
			const next = Math.min(Math.max(Math.round(resolve(current, total)), 0), upper);

			frontmatter[settings.currentPageProperty] = next;

			if (settings.autoStatus && total !== null && total > 0) {
				const status = frontmatter[settings.statusProperty];
				const blank = typeof status !== "string" || status.trim().length === 0;

				if (next >= total) {
					frontmatter[settings.statusProperty] = settings.finishedStatus;
				} else if (next === 0) {
					// Reset to the start: only demote a status this plugin manages,
					// so bespoke values such as "abandoned" survive untouched.
					if (status === settings.finishedStatus || status === settings.readingStatus) {
						frontmatter[settings.statusProperty] = settings.unreadStatus;
					}
				} else if (
					blank ||
					status === settings.unreadStatus ||
					status === settings.finishedStatus
				) {
					frontmatter[settings.statusProperty] = settings.readingStatus;
				}
			}

			written = next;
		});
	} catch (error) {
		const message =
			error instanceof Error && error.name === "YAMLParseError"
				? `Reading progress: could not update ${file.basename}. Its frontmatter is malformed.\n\n${error.message}`
				: `Reading progress: could not update ${file.basename}.\n\n${String(error)}`;
		new Notice(message, 8000);
		console.error(message, error);
		return null;
	}

	return written;
}

/** Move a note's position by a relative number of pages. */
export async function movePosition(
	app: App,
	file: TFile,
	delta: number,
	settings: ReadingProgressSettings,
): Promise<number | null> {
	return applyPosition(app, file, (current) => current + delta, settings);
}

/** Set a note's position to an absolute page number. */
export async function writePosition(
	app: App,
	file: TFile,
	target: number,
	settings: ReadingProgressSettings,
): Promise<number | null> {
	return applyPosition(app, file, () => target, settings);
}

/** Set a note's position to the last page. */
export async function finishBook(
	app: App,
	file: TFile,
	settings: ReadingProgressSettings,
): Promise<number | null> {
	return applyPosition(app, file, (current, total) => total ?? current, settings);
}

export interface GoalTotals {
	/** Pages counted toward the goal. */
	pagesRead: number;
	/** Books whose status matches the finished value. */
	booksFinished: number;
	/** Books with progress that are not finished. */
	booksInProgress: number;
	/** Every note carrying the book tag. */
	booksTotal: number;
}

/**
 * Sum reading progress across every book note in the vault.
 *
 * Finished books contribute their full page count. Books in progress
 * contribute their current position, so a book you are 300 pages into is not
 * worth zero until the day you finish it.
 */
export function collectGoalTotals(app: App, settings: ReadingProgressSettings): GoalTotals {
	const totals: GoalTotals = {
		pagesRead: 0,
		booksFinished: 0,
		booksInProgress: 0,
		booksTotal: 0,
	};

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!isBookNote(cache, settings)) continue;

		totals.booksTotal += 1;

		const state = readBookState(cache, settings);
		const finished =
			state.status === settings.finishedStatus ||
			(state.total !== null && state.total > 0 && state.current >= state.total);

		if (finished) {
			totals.booksFinished += 1;
			totals.pagesRead += state.total ?? state.current;
			continue;
		}

		if (state.current > 0) {
			totals.booksInProgress += 1;
			if (settings.countBooksInProgress) {
				totals.pagesRead += state.current;
			}
		}
	}

	return totals;
}
