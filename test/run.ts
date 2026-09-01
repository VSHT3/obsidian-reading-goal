import { FakeApp, notices } from "./obsidian-stub";
import type { App } from "obsidian";
import {
	collectGoalTotals,
	isBookNote,
	isTrackable,
	movePosition,
	readBookState,
	writePosition,
} from "../src/progress";
import { DEFAULT_SETTINGS } from "../src/settings";
import { goalOptions, parseOptions, progressOptions } from "../src/block-options";
import { applyTemplate } from "../src/template";

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

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
