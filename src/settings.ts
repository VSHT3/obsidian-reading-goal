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
	/** Date the goal should be reached by, as YYYY-MM-DD. Empty for none. */
	goalDeadline: string;

	/** Render the numeric percentage next to the bar. */
	showPercentage: boolean;
	/** Render the increment/decrement buttons inside the progress block. */
	showButtons: boolean;
	/** Include the rewind buttons alongside the advance buttons. */
	showMinusButtons: boolean;
	/** Show the active book's position in the status bar. */
	showStatusBar: boolean;
	/** Estimate a reading pace from the log, when the log is kept. */
	showPace: boolean;
	/** Show the goal block's line of book counts. */
	showDetails: boolean;
	/** Show the button that opens the page prompt. */
	showSetButton: boolean;

	/** Fill colour of an unfinished bar. Empty follows the theme accent. */
	barColor: string;
	/** Fill colour of a completed bar. Empty follows the theme's success colour. */
	completeColor: string;
	/** Bar height in pixels. */
	barHeight: number;
	/** Label template for book bars. Empty uses the built-in wording. */
	progressLabel: string;
	/** Label template for the goal bar. Empty uses the built-in wording. */
	goalLabel: string;
	/** Template for the status bar item. */
	statusBarFormat: string;

	/** Append a dated line to the note body on every position change. */
	enableHistory: boolean;
	/** Heading the reading log lives under. */
	historyHeading: string;
	/** Moment format for log dates. */
	historyDateFormat: string;
	/** Days of log history the pace estimate looks back over. */
	paceWindowDays: number;

	/** Frontmatter key counting completed re-reads. */
	rereadProperty: string;
	/** Add re-read passes to the goal total. */
	countRereads: boolean;

	/** Vault path of the generated base. */
	basePath: string;
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

	pageGoal: 10000,
	wordsPerPage: 420,
	countBooksInProgress: true,
	goalDeadline: "",

	showPercentage: true,
	showButtons: true,
	showMinusButtons: true,
	showStatusBar: true,
	showPace: true,
	showDetails: true,
	showSetButton: true,

	barColor: "",
	completeColor: "",
	barHeight: 10,
	progressLabel: "",
	goalLabel: "",
	statusBarFormat: "{current} / {total} \u00b7 {percent}",

	enableHistory: false,
	historyHeading: "Reading log",
	historyDateFormat: "YYYY-MM-DD",
	paceWindowDays: 30,

	rereadProperty: "re-read?",
	countRereads: false,

	basePath: "Books.base",
};
