import { App, CachedMetadata, Notice, TFile, getAllTags, moment } from "obsidian";
import type { ReadingProgressSettings } from "./settings";
import { updateLog } from "./history";

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
	let previous: number | null = null;

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

			previous = current;
			written = next;
		});
	} catch (error) {
		const message =
			error instanceof Error && error.name === "YAMLParseError"
				? `Reading Goal: could not update ${file.basename}. Its frontmatter is malformed.\n\n${error.message}`
				: `Reading Goal: could not update ${file.basename}.\n\n${String(error)}`;
		new Notice(message, 8000);
		console.error(message, error);
		return null;
	}

	if (settings.enableHistory && written !== null && written !== previous) {
		await recordHistory(app, file, written, settings);
	}

	return written;
}

/** Append or refresh today's line in the note's reading log. */
async function recordHistory(
	app: App,
	file: TFile,
	page: number,
	settings: ReadingProgressSettings,
): Promise<void> {
	const date = moment().format(settings.historyDateFormat);
	try {
		await app.vault.process(file, (content) =>
			updateLog(content, settings.historyHeading, date, page),
		);
	} catch (error) {
		new Notice(`Reading Goal: could not write the reading log for ${file.basename}.`, 6000);
		console.error(error);
	}
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

/**
 * Begin another pass through a finished book.
 *
 * Increments the re-read counter, returns to page zero and marks the book as
 * being read again, in one transaction so the note is never briefly
 * inconsistent. The counter is what lets a re-read still contribute to the
 * goal after the position has been reset.
 */
export async function startReread(
	app: App,
	file: TFile,
	settings: ReadingProgressSettings,
): Promise<number | null> {
	let passes: number | null = null;

	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const previous = toCount(frontmatter[settings.rereadProperty]) ?? 0;
			passes = previous + 1;
			frontmatter[settings.rereadProperty] = passes;
			frontmatter[settings.currentPageProperty] = 0;
			if (settings.autoStatus) {
				frontmatter[settings.statusProperty] = settings.readingStatus;
			}
		});
	} catch (error) {
		new Notice(`Reading Goal: could not start a re-read of ${file.basename}.`, 6000);
		console.error(error);
		return null;
	}

	return passes;
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
	/** Extra passes counted, when re-reads contribute to the goal. */
	rereads: number;
}

/**
 * Sum reading progress across every book note in the vault.
 *
 * Finished books contribute their full page count. Books in progress
 * contribute their current position, so a book you are 300 pages into is not
 * worth zero until the day you finish it.
 *
 * A book being re-read has already been read through once per recorded
 * re-read, so it keeps its full length while the new pass is under way.
 * Starting a re-read therefore never lowers the total.
 */
export function collectGoalTotals(app: App, settings: ReadingProgressSettings): GoalTotals {
	const totals: GoalTotals = {
		pagesRead: 0,
		booksFinished: 0,
		booksInProgress: 0,
		booksTotal: 0,
		rereads: 0,
	};

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!isBookNote(cache, settings)) continue;

		totals.booksTotal += 1;

		const state = readBookState(cache, settings);
		const length = state.total ?? state.current;
		const rereads = toCount(cache?.frontmatter?.[settings.rereadProperty]) ?? 0;

		if (isFinished(state, settings)) {
			totals.booksFinished += 1;
			totals.pagesRead += length;
			if (settings.countRereads) {
				totals.rereads += rereads;
				totals.pagesRead += length * rereads;
			}
			continue;
		}

		if (state.current > 0) totals.booksInProgress += 1;

		if (rereads > 0) {
			// Every pass before this one is complete. Counting distinct books,
			// that is the book once and the current pass adds nothing new.
			if (!settings.countRereads) {
				totals.pagesRead += length;
				continue;
			}
			totals.rereads += rereads - 1;
			totals.pagesRead += length * rereads;
		}

		if (settings.countBooksInProgress) totals.pagesRead += state.current;
	}

	return totals;
}

function isFinished(state: BookState, settings: ReadingProgressSettings): boolean {
	return (
		state.status === settings.finishedStatus ||
		(state.total !== null && state.total > 0 && state.current >= state.total)
	);
}

export interface BookEntry {
	file: TFile;
	state: BookState;
	finished: boolean;
}

/**
 * Every book the position commands can act on, most relevant first: books in
 * progress by recency, then unstarted books by name, then finished ones.
 */
export function listBooks(app: App, settings: ReadingProgressSettings): BookEntry[] {
	const books: BookEntry[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!isBookNote(cache, settings) || !isTrackable(cache, settings)) continue;
		const state = readBookState(cache, settings);
		books.push({ file, state, finished: isFinished(state, settings) });
	}

	const rank = (book: BookEntry) => (book.finished ? 2 : book.state.current > 0 ? 0 : 1);

	return books.sort((a, b) => {
		const byRank = rank(a) - rank(b);
		if (byRank !== 0) return byRank;
		if (rank(a) === 1) return a.file.basename.localeCompare(b.file.basename);
		return b.file.stat.mtime - a.file.stat.mtime;
	});
}

/**
 * Turn what was typed into the page prompt into a page number.
 *
 * Accepts an absolute page (`120`), a move relative to the current position
 * (`+15`, `-5`) or a percentage of the book (`40%`). Returns null for anything
 * else, so the prompt can refuse it instead of guessing.
 */
export function parsePositionInput(input: string, current: number, total: number): number | null {
	const text = input.replace(/\s+/g, "");
	let target: number;

	if (/^[+-]\d+$/.test(text)) {
		target = current + Number.parseInt(text, 10);
	} else if (/^\d+(\.\d+)?%$/.test(text)) {
		target = Math.round((Number.parseFloat(text) / 100) * total);
	} else if (/^\d+$/.test(text)) {
		target = Number.parseInt(text, 10);
	} else {
		return null;
	}

	return Math.min(Math.max(target, 0), total);
}

/**
 * Turn a plain note into a book: add the book tag, record its length and
 * position, and give it a status when it has none.
 *
 * Returns false when the write was refused.
 */
export async function trackBook(
	app: App,
	file: TFile,
	pages: number,
	current: number,
	settings: ReadingProgressSettings,
): Promise<boolean> {
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const wanted = settings.bookTag.replace(/^#/, "");
			const raw: unknown = frontmatter.tags;
			// A tags value may be a list or a comma- or space-separated string.
			const tags = Array.isArray(raw)
				? raw.map(String)
				: typeof raw === "string"
					? raw.split(/[,\s]+/).filter((tag) => tag.length > 0)
					: [];
			const tagged = tags.some(
				(tag) => tag.replace(/^#/, "").toLowerCase() === wanted.toLowerCase(),
			);
			if (wanted.length > 0 && !tagged) frontmatter.tags = [...tags, wanted];

			const position = Math.min(Math.max(Math.round(current), 0), pages);
			frontmatter[settings.pagesProperty] = pages;
			frontmatter[settings.currentPageProperty] = position;

			const status: unknown = frontmatter[settings.statusProperty];
			const blank = typeof status !== "string" || status.trim().length === 0;
			if (settings.autoStatus && blank) {
				frontmatter[settings.statusProperty] =
					position >= pages
						? settings.finishedStatus
						: position > 0
							? settings.readingStatus
							: settings.unreadStatus;
			}
		});
	} catch (error) {
		new Notice(`Reading Goal: could not set up ${file.basename} as a book.`, 6000);
		console.error(error);
		return false;
	}

	return true;
}
