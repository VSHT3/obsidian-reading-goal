import { FakeApp, FIXED_DATE, notices } from "./obsidian-stub";
import type { App } from "obsidian";
import {
	collectGoalTotals,
	listBooks,
	parsePositionInput,
	trackBook,
	isBookNote,
	isTrackable,
	finishBook,
	movePosition,
	readBookState,
	startReread,
	writePosition,
} from "../src/progress";
import { DEFAULT_SETTINGS } from "../src/settings";
import { goalOptions, parseOptions, progressOptions } from "../src/block-options";
import { applyTemplate } from "../src/template";
import { readLog, updateLog } from "../src/history";
import { bookPace, describeGoalPace, formatPerDay, goalPace, parseDeadline } from "../src/pace";
import { GOAL_TOKENS, PROGRESS_TOKENS, progressLabel, unknownTokens } from "../src/labels";

const settings = { ...DEFAULT_SETTINGS, pageGoal: 1000, wordsPerPage: 400 };

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	checks += 1;
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a === b) {
		console.log(`  ok   ${label}`);
		return;
	}
	failures += 1;
	console.log(`  FAIL ${label}\n         expected ${b}\n         actual   ${a}`);
}

function section(title: string): void {
	console.log(`\n${title}`);
}

/** The stub implements only the surface progress.ts uses. */
const asApp = (app: FakeApp) => app as unknown as App;

section("Reading state from frontmatter");
{
	const app = new FakeApp();
	const file = app.add("Throne of Glass.md", {
		tags: ["Book", "Review"],
		pages: 435,
		currentpage: 30,
		status: "reading",
	});
	const state = readBookState(app.metadataCache.getFileCache(file), settings);
	check("current page", state.current, 30);
	check("total pages", state.total, 435);
	check("fraction", Number(state.fraction.toFixed(4)), 0.069);
	check("recognised as a book", isBookNote(app.metadataCache.getFileCache(file), settings), true);
	check("trackable", isTrackable(app.metadataCache.getFileCache(file), settings), true);
}

{
	const app = new FakeApp();
	// Hand-edited YAML and imports routinely yield strings.
	const file = app.add("Strings.md", { tags: "Book", pages: "300", currentpage: "150" });
	const state = readBookState(app.metadataCache.getFileCache(file), settings);
	check("numeric strings coerce", [state.total, state.current], [300, 150]);
}

{
	const app = new FakeApp();
	const file = app.add("No page count.md", { tags: ["Book"], currentpage: 12 });
	check(
		"missing page count is not trackable",
		isTrackable(app.metadataCache.getFileCache(file), settings),
		false,
	);
	check(
		"missing page count yields zero fraction",
		readBookState(app.metadataCache.getFileCache(file), settings).fraction,
		0,
	);
}

{
	const app = new FakeApp();
	const file = app.add("Not a book.md", { tags: ["Article"], pages: 10 });
	check("untagged note is not a book", isBookNote(app.metadataCache.getFileCache(file), settings), false);
}

{
	const app = new FakeApp();
	const file = app.add("Case.md", { tags: ["book"], pages: 10 });
	check("tag match ignores case", isBookNote(app.metadataCache.getFileCache(file), settings), true);
}

section("Clamping");
{
	const app = new FakeApp();
	const file = app.add("Clamp.md", { tags: ["Book"], pages: 100, currentpage: 98 });

	check("advance past the end clamps", await movePosition(asApp(app), file, 5, settings), 100);
	check("rewind past zero clamps", await movePosition(asApp(app), file, -500, settings), 0);
	check("absolute set clamps high", await writePosition(asApp(app), file, 9999, settings), 100);
	check("absolute set clamps low", await writePosition(asApp(app), file, -3, settings), 0);
	check("fractional input rounds", await writePosition(asApp(app), file, 42.6, settings), 43);
}

section("Rapid repeated moves");
{
	const app = new FakeApp();
	const file = app.add("Scrub.md", { tags: ["Book"], pages: 1000, currentpage: 0 });

	// Holding a repeatable hotkey fires moves faster than the metadata cache
	// updates. Every step must land, so the deltas have to compose against the
	// note itself rather than a cached snapshot.
	await Promise.all(
		Array.from({ length: 40 }, () => movePosition(asApp(app), file, 1, settings)),
	);
	check("forty concurrent single steps all land", app.frontmatterOf("Scrub.md").currentpage, 40);

	await Promise.all(
		Array.from({ length: 10 }, () => movePosition(asApp(app), file, -2, settings)),
	);
	check("concurrent rewinds all land", app.frontmatterOf("Scrub.md").currentpage, 20);
}

section("Status transitions");
{
	const app = new FakeApp();
	const file = app.add("Status.md", { tags: ["Book"], pages: 100, currentpage: 0, status: "to read" });

	await movePosition(asApp(app), file, 5, settings);
	check("to read becomes reading", app.frontmatterOf("Status.md").status, "reading");

	await writePosition(asApp(app), file, 100, settings);
	check("last page becomes finished", app.frontmatterOf("Status.md").status, "finished");

	await movePosition(asApp(app), file, -1, settings);
	check("rewinding from the end returns to reading", app.frontmatterOf("Status.md").status, "reading");

	await writePosition(asApp(app), file, 0, settings);
	check("reset to zero returns to unread", app.frontmatterOf("Status.md").status, "to read");
}

{
	const app = new FakeApp();
	const file = app.add("Blank.md", { tags: ["Book"], pages: 100, currentpage: 0, status: "" });
	await movePosition(asApp(app), file, 1, settings);
	check("blank status is filled in", app.frontmatterOf("Blank.md").status, "reading");
}

{
	const app = new FakeApp();
	const file = app.add("Abandoned.md", { tags: ["Book"], pages: 100, currentpage: 40, status: "abandoned" });
	await writePosition(asApp(app), file, 0, settings);
	check("unmanaged status survives a reset", app.frontmatterOf("Abandoned.md").status, "abandoned");
}

{
	const app = new FakeApp();
	const file = app.add("Frozen.md", { tags: ["Book"], pages: 100, currentpage: 10, status: "to read" });
	await movePosition(asApp(app), file, 5, { ...settings, autoStatus: false });
	check("status untouched when auto-status is off", app.frontmatterOf("Frozen.md").status, "to read");
	check("position still moves", app.frontmatterOf("Frozen.md").currentpage, 15);
}

section("Malformed frontmatter");
{
	const app = new FakeApp();
	const file = app.add("Broken.md", { tags: ["Book"], pages: 100, currentpage: 5 });
	app.malformed = "Broken.md";
	notices.length = 0;
	check("write refused", await movePosition(asApp(app), file, 1, settings), null);
	check("one notice raised", notices.length, 1);
	check("notice names the file", notices[0].includes("Broken"), true);
}

section("Vault-wide goal");
{
	const app = new FakeApp();
	app.add("Finished with count.md", { tags: ["Book"], pages: 300, currentpage: 300, status: "finished" });
	// Most finished books in a real vault never got a currentpage.
	app.add("Finished no currentpage.md", { tags: ["Book"], pages: 200, status: "finished" });
	app.add("In progress.md", { tags: ["Book"], pages: 400, currentpage: 150, status: "reading" });
	app.add("Untouched.md", { tags: ["Book"], pages: 500, currentpage: 0, status: "to read" });
	app.add("Not a book.md", { tags: ["Article"], pages: 900, currentpage: 900, status: "finished" });

	const totals = collectGoalTotals(asApp(app), settings);
	check("pages counted", totals.pagesRead, 650);
	check("books finished", totals.booksFinished, 2);
	check("books in progress", totals.booksInProgress, 1);
	check("books on the shelf", totals.booksTotal, 4);

	const finishedOnly = collectGoalTotals(asApp(app), { ...settings, countBooksInProgress: false });
	check("excluding in-progress books", finishedOnly.pagesRead, 500);
	check("in-progress books still counted as such", finishedOnly.booksInProgress, 1);
}

{
	const app = new FakeApp();
	// currentpage at the page count, but nobody updated the status.
	app.add("Implicitly done.md", { tags: ["Book"], pages: 250, currentpage: 250, status: "reading" });
	const totals = collectGoalTotals(asApp(app), settings);
	check("full position counts as finished", totals.booksFinished, 1);
	check("counted once, at full length", totals.pagesRead, 250);
}

section("Block options");
{
	const empty = progressOptions("", settings);
	check("empty block inherits settings", [empty.settings.smallStep, empty.showButtons], [1, true]);

	const tuned = progressOptions("small: 10\nlarge: 25\nbuttons: false\npercent: no", settings);
	check("steps override", [tuned.settings.smallStep, tuned.settings.largeStep], [10, 25]);
	check("buttons off", tuned.showButtons, false);
	check("percent accepts no", tuned.showPercentage, false);

	const renamed = progressOptions("pages: length\ncurrent: at\nstatus: state", settings);
	check(
		"property names override",
		[
			renamed.settings.pagesProperty,
			renamed.settings.currentPageProperty,
			renamed.settings.statusProperty,
		],
		["length", "at", "state"],
	);

	const styled = progressOptions("color: #00A5FF\nheight: 18\nfile: [[Dune]]", settings);
	check("colour, height and file", [styled.color, styled.height, styled.file], ["#00A5FF", 18, "[[Dune]]"]);

	const messy = progressOptions("  # a comment\n\nbuttons:   true   \nnonsense: 3\nbare line", settings);
	check("comments and blanks skipped, values trimmed", messy.showButtons, true);
	check("unknown keys reported", messy.unknown, ["nonsense", "bare line"]);

	const bad = progressOptions("small: banana\nheight: -4", settings);
	check("unparseable numbers fall back", bad.settings.smallStep, 1);
	check("out-of-range height falls back", bad.height, 10);

	const goal = goalOptions("goal: 50000\ntag: Livre\nwords: 0\ninprogress: false\ndetails: off", settings);
	check(
		"goal options override",
		[goal.settings.pageGoal, goal.settings.bookTag, goal.settings.wordsPerPage],
		[50000, "Livre", 0],
	);
	check("in-progress toggle", goal.settings.countBooksInProgress, false);
	check("details toggle", goal.showDetails, false);

	check("keys are case-insensitive", progressOptions("BUTTONS: false", settings).showButtons, false);
	check(
		"values containing colons survive",
		parseOptions("color: rgb(1, 2, 3)", ["color"]).values.color,
		"rgb(1, 2, 3)",
	);

	check("label defaults to built-in wording", progressOptions("", settings).label.kind, "default");
	check("label: false hides", progressOptions("label: false", settings).label.kind, "hidden");
	check("label: true keeps default", progressOptions("label: true", settings).label.kind, "default");

	const custom = progressOptions("label: Page {current} of {total}", settings).label;
	check("custom label captured", [custom.kind, custom.kind === "custom" ? custom.template : null], [
		"custom",
		"Page {current} of {total}",
	]);

	check("minus defaults on", progressOptions("", settings).showMinus, true);
	check("minus can be turned off", progressOptions("minus: false", settings).showMinus, false);
	check("plus can be turned off", progressOptions("plus: no", settings).showPlus, false);
	check(
		"minus follows the setting",
		progressOptions("", { ...settings, showMinusButtons: false }).showMinus,
		false,
	);
}

section("Label templates");
{
	const values = { current: "30", total: "435", percent: "7%" };

	check(
		"tokens substitute",
		applyTemplate("Page {current} of {total} \u2014 {percent}", values).text,
		"Page 30 of 435 \u2014 7%",
	);
	check("repeated tokens all substitute", applyTemplate("{current}/{current}", values).text, "30/30");
	check("tokens are case-insensitive", applyTemplate("{CURRENT}", values).text, "30");
	check("text without tokens is untouched", applyTemplate("Reading", values).text, "Reading");

	const typo = applyTemplate("{current} of {totl}", values);
	check("unknown token left visible", typo.text, "30 of {totl}");
	check("unknown token reported", typo.unknown, ["{totl}"]);

	check("braces without a token survive", applyTemplate("a { b } c", values).text, "a { b } c");
}

section("Reading log");
{
	const heading = "Reading log";

	check(
		"section created when absent",
		updateLog("---\ntitle: x\n---\n\nNotes.", heading, "2026-09-01", 30),
		"---\ntitle: x\n---\n\nNotes.\n\n## Reading log\n\n- 2026-09-01: 30\n",
	);

	check(
		"entry appended to an existing section",
		updateLog("## Reading log\n\n- 2026-08-30: 10\n", heading, "2026-09-01", 30),
		"## Reading log\n\n- 2026-08-30: 10\n- 2026-09-01: 30\n",
	);

	// Holding a hotkey must not produce forty lines.
	let repeated = "## Reading log\n\n- 2026-09-01: 30\n";
	for (const page of [31, 32, 33]) repeated = updateLog(repeated, heading, "2026-09-01", page);
	check("same day rewritten in place", repeated, "## Reading log\n\n- 2026-09-01: 33\n");

	check(
		"a later section is not disturbed",
		updateLog(
			"## Reading log\n\n- 2026-08-30: 10\n\n## Quotes\n\nSomething memorable.\n",
			heading,
			"2026-09-01",
			30,
		),
		"## Reading log\n\n- 2026-08-30: 10\n- 2026-09-01: 30\n\n## Quotes\n\nSomething memorable.\n",
	);

	check(
		"deeper headings inside the section are kept",
		updateLog("## Reading log\n\n### Part one\n\n- 2026-08-30: 10\n", heading, "2026-09-01", 30),
		"## Reading log\n\n### Part one\n\n- 2026-08-30: 10\n- 2026-09-01: 30\n",
	);

	check(
		"heading match ignores case and level",
		updateLog("# reading LOG\n\n- 2026-08-30: 10\n", heading, "2026-09-01", 30),
		"# reading LOG\n\n- 2026-08-30: 10\n- 2026-09-01: 30\n",
	);

	check(
		"a frontmatter line cannot be mistaken for the heading",
		updateLog("---\nx: 1\n---\n", heading, "2026-09-01", 30),
		"---\nx: 1\n---\n\n## Reading log\n\n- 2026-09-01: 30\n",
	);

	check(
		"empty section gains a blank line",
		updateLog("## Reading log\n", heading, "2026-09-01", 30),
		"## Reading log\n\n- 2026-09-01: 30",
	);
}

section("Reading log writes");
{
	const withLog = { ...settings, enableHistory: true };
	const app = new FakeApp();
	const file = app.add("Logged.md", { tags: ["Book"], pages: 300, currentpage: 0 });
	app.setBody("Logged.md", "---\npages: 300\n---\n\nNotes.");

	await movePosition(asApp(app), file, 20, withLog);
	check("log written on change", app.body("Logged.md").includes(`- ${FIXED_DATE}: 20`), true);

	await movePosition(asApp(app), file, 5, withLog);
	const lines = app.body("Logged.md").split("\n").filter((l) => l.startsWith("- "));
	check("second move updates the same day", lines, [`- ${FIXED_DATE}: 25`]);

	// Clamped to zero twice: the second write changes nothing, so no log churn.
	await movePosition(asApp(app), file, -999, withLog);
	const atZero = app.body("Logged.md");
	await movePosition(asApp(app), file, -999, withLog);
	check("no-op writes leave the log alone", app.body("Logged.md"), atZero);

	const quiet = new FakeApp();
	const quietFile = quiet.add("Quiet.md", { tags: ["Book"], pages: 300, currentpage: 0 });
	quiet.setBody("Quiet.md", "Notes.");
	await movePosition(asApp(quiet), quietFile, 10, settings);
	check("history off writes nothing", quiet.body("Quiet.md"), "Notes.");
}

section("Re-reads");
{
	const app = new FakeApp();
	const file = app.add("Reread.md", {
		tags: ["Book"],
		pages: 300,
		currentpage: 300,
		status: "finished",
	});

	check("first re-read returns pass count", await startReread(asApp(app), file, settings), 1);
	check("position reset", app.frontmatterOf("Reread.md").currentpage, 0);
	check("status back to reading", app.frontmatterOf("Reread.md").status, "reading");
	check("counter written", app.frontmatterOf("Reread.md")["re-read?"], 1);

	await startReread(asApp(app), file, settings);
	check("counter increments", app.frontmatterOf("Reread.md")["re-read?"], 2);

	// Finish it again so it counts, then check both goal modes.
	await finishBook(asApp(app), file, settings);
	check("ignored unless enabled", collectGoalTotals(asApp(app), settings).pagesRead, 300);

	const counting = { ...settings, countRereads: true };
	const totals = collectGoalTotals(asApp(app), counting);
	check("two re-reads add two more passes", totals.pagesRead, 900);
	check("re-reads reported", totals.rereads, 2);

	const unread = new FakeApp();
	unread.add("Once.md", { tags: ["Book"], pages: 300, currentpage: 300, status: "finished" });
	check(
		"a book never re-read is unaffected",
		collectGoalTotals(asApp(unread), counting).pagesRead,
		300,
	);

	// A second pass under way: the first is complete and must stay counted.
	const midway = new FakeApp();
	const again = midway.add("Again.md", {
		tags: ["Book"],
		pages: 300,
		currentpage: 300,
		status: "finished",
	});
	await startReread(asApp(midway), again, settings);
	check(
		"starting a re-read does not lower the total",
		collectGoalTotals(asApp(midway), settings).pagesRead,
		300,
	);
	await movePosition(asApp(midway), again, 120, settings);
	check(
		"counting distinct books, the second pass adds nothing",
		collectGoalTotals(asApp(midway), settings).pagesRead,
		300,
	);
	const partway = collectGoalTotals(asApp(midway), counting);
	check("counting re-reads, the second pass adds its pages", partway.pagesRead, 420);
	check("an unfinished pass is not reported as a re-read", partway.rereads, 0);
	check("the book shows as in progress", [partway.booksInProgress, partway.booksFinished], [1, 0]);
}

section("Page prompt input");
{
	check("absolute page", parsePositionInput("120", 30, 435), 120);
	check("relative advance", parsePositionInput("+15", 30, 435), 45);
	check("relative rewind", parsePositionInput("- 5", 30, 435), 25);
	check("percentage", parsePositionInput("50%", 30, 400), 200);
	check("clamped to the last page", parsePositionInput("+999", 30, 435), 435);
	check("clamped to zero", parsePositionInput("-999", 30, 435), 0);
	check("empty input is refused", parsePositionInput("", 30, 435), null);
	check("words are refused", parsePositionInput("12 pages", 30, 435), null);
}

section("Tracking a plain note");
{
	const app = new FakeApp();
	const file = app.add("Plain.md", { tags: "Fiction, Review" });
	check("write succeeds", await trackBook(asApp(app), file, 300, 40, settings), true);
	const written = app.frontmatterOf("Plain.md");
	check("tag appended to a string list", written.tags, ["Fiction", "Review", "Book"]);
	check("length and position written", [written.pages, written.currentpage], [300, 40]);
	check("blank status becomes reading", written.status, "reading");
	check(
		"now counts as a trackable book",
		[
			isBookNote(app.metadataCache.getFileCache(file), settings),
			isTrackable(app.metadataCache.getFileCache(file), settings),
		],
		[true, true],
	);

	const tagged = app.add("Tagged.md", { tags: ["book"], status: "abandoned" });
	await trackBook(asApp(app), tagged, 200, 999, settings);
	const kept = app.frontmatterOf("Tagged.md");
	check("existing tag is not duplicated", kept.tags, ["book"]);
	check("position clamped to the length", kept.currentpage, 200);
	check("existing status is left alone", kept.status, "abandoned");
}

section("Book picker order");
{
	const app = new FakeApp();
	app.add("Zebra unread.md", { tags: ["Book"], pages: 100 });
	app.add("Done.md", { tags: ["Book"], pages: 100, currentpage: 100 });
	app.add("Apple unread.md", { tags: ["Book"], pages: 100, currentpage: 0 });
	app.add("Halfway.md", { tags: ["Book"], pages: 100, currentpage: 50 });
	app.add("No length.md", { tags: ["Book"], currentpage: 5 });
	app.add("Not a book.md", { pages: 100, currentpage: 5 });
	check(
		"in progress, then unread by name, then finished",
		listBooks(asApp(app), settings).map((book) => book.file.basename),
		["Halfway", "Apple unread", "Zebra unread", "Done"],
	);
}

section("Goal deadline");
{
	const now = new Date(2026, 10, 23, 15, 30);
	check("malformed date is refused", parseDeadline("23/11/2026"), null);
	check("overflowing date is refused", parseDeadline("2026-02-31"), null);

	const pace = goalPace(400, 1000, parseDeadline("2026-12-02") as Date, now);
	check("days left", pace.daysLeft, 9);
	check("today and the deadline both count as reading days", pace.perDay, 60);
	check(
		"described",
		describeGoalPace(pace),
		"9 days left \u00b7 60 pages a day to finish on time",
	);

	const today = goalPace(400, 1000, parseDeadline("2026-11-23") as Date, now);
	check("a deadline of today leaves the whole remainder", [today.daysLeft, today.perDay], [0, 600]);

	const late = goalPace(400, 1000, parseDeadline("2026-11-20") as Date, now);
	check("a passed deadline is reported", describeGoalPace(late), "Deadline passed 3 days ago \u00b7 600 pages short");

	check(
		"block deadline overrides the setting",
		goalOptions("deadline: 2027-01-01", { ...settings, goalDeadline: "2026-12-31" }).settings.goalDeadline,
		"2027-01-01",
	);
	check(
		"deadline: none drops the setting's deadline",
		goalOptions("deadline: none", { ...settings, goalDeadline: "2026-12-31" }).settings.goalDeadline,
		"",
	);
}

section("Reading pace");
{
	const note = "---\npages: 400\n---\n\n## Reading log\n\n- 2026-08-28: 40\n- 2026-08-30: 120\nnot an entry\n- 2026-09-01: 200\n\n## Notes\n\n- 2026-09-02: 999\n";
	check("log entries read back, stopping at the next heading", readLog(note, "Reading log"), [
		{ date: "2026-08-28", page: 40 },
		{ date: "2026-08-30", page: 120 },
		{ date: "2026-09-01", page: 200 },
	]);
	check("a note without a log has no entries", readLog("# Title\n", "Reading log"), []);

	const pace = bookPace(
		[
			{ daysAgo: 4, page: 40 },
			{ daysAgo: 2, page: 120 },
			{ daysAgo: 0, page: 200 },
		],
		200,
		400,
	);
	check("pages a day since the first entry", pace?.perDay, 40);
	check("days left at that pace", pace?.daysLeft, 5);

	check("one day of entries is not enough", bookPace([{ daysAgo: 0, page: 200 }], 200, 400), null);
	check(
		"only the current pass counts after a re-read",
		bookPace(
			[
				{ daysAgo: 20, page: 100 },
				{ daysAgo: 10, page: 400 },
				{ daysAgo: 2, page: 10 },
				{ daysAgo: 0, page: 50 },
			],
			50,
			400,
		)?.perDay,
		20,
	);
	check(
		"entries older than the window are ignored",
		bookPace([{ daysAgo: 90, page: 10 }, { daysAgo: 1, page: 100 }], 130, 400)?.perDay,
		30,
	);
	check("slow paces keep a decimal", formatPerDay(2.26), "2.3 pages a day");
}

section("Settings as defaults for blocks");
{
	const custom = { ...settings, showSetButton: false, showDetails: false };
	check("page button follows the setting", progressOptions("", custom).showSet, false);
	check("a block can turn it back on", progressOptions("set: true", custom).showSet, true);
	check("goal details follow the setting", goalOptions("", custom).showDetails, false);
	check("a block can turn them back on", goalOptions("details: true", custom).showDetails, true);

	const state = { total: 688, current: 349, status: "reading", fraction: 349 / 688 };
	check(
		"empty label template gives the built-in wording",
		progressLabel("", state, "Dune", 400).text,
		"Page 349 of 688.",
	);
	check(
		"built-in wording names another note's book",
		progressLabel("", { ...state, current: 688 }, "Dune", 400, "Dune \u2014 ").text,
		"Dune \u2014 Finished \u2014 all 688 pages.",
	);
	check(
		"label template from settings is applied",
		progressLabel("{title}: {remaining} left", state, "Dune", 400).text,
		"Dune: 339 left",
	);
	check(
		"a mistyped placeholder is caught before it is saved",
		unknownTokens("{title} {totl} {pace}", PROGRESS_TOKENS),
		["{totl}", "{pace}"],
	);
	check("goal placeholders validate against their own list", unknownTokens("{read} {pace}", GOAL_TOKENS), []);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
