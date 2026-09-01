export interface ReadingProgressSettings {
	/** Frontmatter key holding the book's total length. */
	pagesProperty: string;
	/** Frontmatter key holding the reader's current position. */
	currentPageProperty: string;
	/** Frontmatter key holding the reading status. */
	statusProperty: string;
	/** Tag that marks a note as a book, without the leading '#'. */
	bookTag: string;

	/** Status value for a book that has not been started. */
	unreadStatus: string;
	/** Status value written when a book is in progress. */
	readingStatus: string;
	/** Status value written when a book is completed. */
	finishedStatus: string;
	/** Rewrite the status property as progress crosses the boundaries. */
	autoStatus: boolean;

	/** Step size for the fine-grained buttons and commands. */
	smallStep: number;
	/** Step size for the coarse buttons and commands. */
	largeStep: number;

	/** Total pages the reader is aiming for across the vault. */
	pageGoal: number;
	/** Words assumed per page when estimating words read. */
	wordsPerPage: number;
	/** Count partially-read books toward the goal, not just finished ones. */
	countBooksInProgress: boolean;

	/** Render the numeric percentage next to the bar. */
	showPercentage: boolean;
	/** Render the increment/decrement buttons inside the progress block. */
	showButtons: boolean;
	/** Include the rewind buttons alongside the advance buttons. */
	showMinusButtons: boolean;

	/** Append a dated line to the note body on every position change. */
	enableHistory: boolean;
	/** Heading the reading log lives under. */
	historyHeading: string;
	/** Moment format for log dates. */
	historyDateFormat: string;

	/** Frontmatter key counting completed re-reads. */
	rereadProperty: string;
	/** Add re-read passes to the goal total. */
	countRereads: boolean;
}

export const DEFAULT_SETTINGS: ReadingProgressSettings = {
	pagesProperty: "pages",
	currentPageProperty: "currentpage",
	statusProperty: "status",
	bookTag: "Book",

	unreadStatus: "to read",
	readingStatus: "reading",
	finishedStatus: "finished",
	autoStatus: true,

	smallStep: 1,
	largeStep: 5,

	pageGoal: 83000,
	wordsPerPage: 420,
	countBooksInProgress: true,

	showPercentage: true,
	showButtons: true,
	showMinusButtons: true,

	enableHistory: false,
	historyHeading: "Reading log",
	historyDateFormat: "YYYY-MM-DD",

	rereadProperty: "re-read?",
	countRereads: false,
};
