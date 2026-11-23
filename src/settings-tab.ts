import {
	App,
	PluginSettingTab,
	Setting,
	requireApiVersion,
	type SettingDefinitionItem,
} from "obsidian";
import type ReadingProgressPlugin from "./main";
import { formatPercent, renderBar } from "./bar";
import {
	GOAL_TOKENS,
	PROGRESS_TOKENS,
	progressLabel,
	tokenList,
	unknownTokens,
} from "./labels";
import { parseDeadline } from "./pace";
import { collectGoalTotals, listBooks, type BookState } from "./progress";
import { DEFAULT_SETTINGS, type ReadingProgressSettings } from "./settings";

type Settings = ReadingProgressSettings;

type KeysOfType<T> = {
	[K in keyof Settings]: Settings[K] extends T ? K : never;
}[keyof Settings];

/** Returns what is wrong with a value, or null when it can be saved. */
type Validate<T> = (value: T) => string | null;

/** One settings row: what search sees, and how to build its control. */
interface Row {
	name: string;
	desc: string;
	visible?: () => boolean;
	build: (setting: Setting) => void;
}

interface Group {
	heading: string;
	rows: Row[];
}

/** The book the preview draws. */
const SAMPLE: BookState = { total: 688, current: 349, status: "reading", fraction: 349 / 688 };

/**
 * The settings tab, described once as rows and rendered two ways.
 *
 * Obsidian 1.13 renders `getSettingDefinitions()` itself and indexes it for
 * settings search; earlier versions call `display()`. Both walk the same rows,
 * so the two cannot drift apart.
 *
 * A value that fails validation is reported under its field and not saved, so
 * the stored settings are always usable.
 */
export class ReadingProgressSettingTab extends PluginSettingTab {
	private readonly plugin: ReadingProgressPlugin;
	/** Re-run after every change, so each row reflects the current settings. */
	private refreshers: { el: HTMLElement; run: () => void }[] = [];

	constructor(app: App, plugin: ReadingProgressPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.groups().map((group) => ({
			type: "group",
			heading: group.heading,
			items: group.rows.map((row) => ({
				name: row.name,
				desc: row.desc,
				visible: row.visible,
				render: (setting: Setting) => row.build(setting),
			})),
		}));
	}

	/** Only reached before Obsidian 1.13, which has no declarative settings. */
	display(): void {
		this.rebuild();
	}

	private rebuild(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.refreshers = [];

		for (const group of this.groups()) {
			new Setting(containerEl).setName(group.heading).setHeading();
			for (const row of group.rows) {
				if (row.visible && !row.visible()) continue;
				row.build(new Setting(containerEl).setName(row.name).setDesc(row.desc));
			}
		}
	}

	private groups(): Group[] {
		const s = () => this.plugin.settings;
		const logOn = () => s().enableHistory;

		return [
			{
				heading: "Goal",
				rows: [
					this.number(
						"Page goal",
						"Total pages you are aiming for across every book in the vault.",
						"pageGoal",
						1,
					),
					this.text(
						"Goal deadline",
						"Optional date to reach the goal by, written like 2026-12-31. The goal block then shows the days left and the pages a day it takes.",
						"goalDeadline",
						{
							placeholder: "2026-12-31",
							validate: (value) =>
								value.length === 0 || parseDeadline(value)
									? null
									: "Write the date as year-month-day, like 2026-12-31.",
						},
					),
					this.toggle(
						"Count books in progress",
						"Add pages read in unfinished books to the goal total, rather than counting finished books only.",
						"countBooksInProgress",
					),
					this.number(
						"Words per page",
						"Used to estimate words read. Set to zero to hide the estimate.",
						"wordsPerPage",
						0,
					),
				],
			},
			{
				heading: "Book notes",
				rows: [
					this.text(
						"Book tag",
						"Notes with this tag count toward the goal. Written without the leading hash.",
						"bookTag",
						{ validate: (value) => (/\s/.test(value) ? "A tag cannot contain spaces." : null) },
					),
					this.text(
						"Total pages property",
						"Frontmatter key holding the book's full length.",
						"pagesProperty",
						{ validate: this.distinct("pagesProperty") },
					),
					this.text(
						"Current page property",
						"Frontmatter key holding your position. This is the value the buttons and commands change.",
						"currentPageProperty",
						{ validate: this.distinct("currentPageProperty") },
					),
					this.text(
						"Status property",
						"Frontmatter key holding the reading status.",
						"statusProperty",
						{ validate: this.distinct("statusProperty") },
					),
					this.matchingNotes(),
				],
			},
			{
				heading: "Status",
				rows: [
					this.toggle(
						"Update status automatically",
						"Set the status to finished on reaching the last page, and back to reading if you move earlier.",
						"autoStatus",
					),
					this.text(
						"Unread status value",
						"Written when a book is reset to page zero, and recognised as not yet started.",
						"unreadStatus",
						{ validate: this.distinct("unreadStatus") },
					),
					this.text(
						"Reading status value",
						"Written when a book has progress but is not finished.",
						"readingStatus",
						{ validate: this.distinct("readingStatus") },
					),
					this.text(
						"Finished status value",
						"Written when your position reaches the last page. Books with this status count as finished.",
						"finishedStatus",
						{ validate: this.distinct("finishedStatus") },
					),
				],
			},
			{
				heading: "Controls",
				rows: [
					this.toggle(
						"Show buttons",
						"Display the buttons inside the progress block. Commands keep working either way.",
						"showButtons",
					),
					this.number(
						"Small step",
						"Pages moved by the fine-grained buttons and commands.",
						"smallStep",
						1,
					),
					this.number(
						"Large step",
						"Pages moved by the coarse buttons and commands.",
						"largeStep",
						1,
					),
					this.toggle(
						"Show rewind buttons",
						"Include the negative steps. Turn off for advance-only controls.",
						"showMinusButtons",
						() => s().showButtons,
					),
					this.toggle(
						"Show page button",
						"Include the button that opens the page prompt.",
						"showSetButton",
						() => s().showButtons,
					),
				],
			},
			{
				heading: "Appearance",
				rows: [
					this.preview(),
					this.color(
						"Bar colour",
						"Fill of a book or goal in progress. Follows the theme's accent colour until you pick one.",
						"barColor",
						"--interactive-accent",
					),
					this.color(
						"Completed colour",
						"Fill of a finished book or a reached goal. Follows the theme's success colour until you pick one.",
						"completeColor",
						"--text-success",
					),
					this.slider("Bar height", "In pixels.", "barHeight", 2, 40),
					this.toggle(
						"Show percentage",
						"Display the numeric percentage under the bar.",
						"showPercentage",
					),
					this.template(
						"Book label",
						"Text above a book's bar. Leave empty for the built-in wording.",
						"progressLabel",
						PROGRESS_TOKENS,
						"Page {current} of {total}",
					),
					this.template(
						"Goal label",
						"Text above the goal bar. Leave empty for the built-in wording.",
						"goalLabel",
						GOAL_TOKENS,
						"{read} of {goal} pages",
					),
					this.toggle(
						"Show goal details",
						"Display the line of book counts and estimated words under the goal bar.",
						"showDetails",
					),
				],
			},
			{
				heading: "Status bar",
				rows: [
					this.toggle(
						"Show position in the status bar",
						"While a book note is open, show its position in the status bar. Click it to set the page. Desktop only.",
						"showStatusBar",
					),
					this.template(
						"Status bar text",
						"What the status bar shows for the open book.",
						"statusBarFormat",
						PROGRESS_TOKENS,
						DEFAULT_SETTINGS.statusBarFormat,
						() => s().showStatusBar,
					),
				],
			},
			{
				heading: "Re-reads",
				rows: [
					this.text(
						"Re-read count property",
						"Frontmatter key counting completed passes through a book.",
						"rereadProperty",
						{ validate: this.distinct("rereadProperty") },
					),
					this.toggle(
						"Count re-reads toward the goal",
						"Add one further copy of a book's length to the total for each recorded re-read.",
						"countRereads",
					),
				],
			},
			{
				heading: "Reading log",
				rows: [
					this.toggle(
						"Keep a dated reading log",
						"Write a dated line into the note body whenever the position changes, so reading history survives. One entry per day is rewritten in place. Off by default; it edits note bodies.",
						"enableHistory",
					),
					this.text(
						"Log heading",
						"Heading the log lives under. Created at the end of the note if missing.",
						"historyHeading",
						{ visible: logOn },
					),
					this.dateFormat(logOn),
					this.toggle(
						"Show reading pace",
						"Estimate pages a day and days left from the log, under each book's bar. Appears once the log holds an entry from before today.",
						"showPace",
						logOn,
					),
					this.number(
						"Pace window",
						"Days of log history the pace looks back over. Shorter follows recent reading more closely; longer is steadier.",
						"paceWindowDays",
						2,
						() => logOn() && s().showPace,
					),
				],
			},
			{
				heading: "Base",
				rows: [
					this.text(
						"Base file",
						"Where the books base is created and opened from. Folders in the path are created as needed.",
						"basePath",
						{
							validate: (value) =>
								value.toLowerCase().endsWith(".base")
									? null
									: "The path must end in .base.",
						},
					),
				],
			},
			{
				heading: "Reset",
				rows: [this.restoreAll()],
			},
		];
	}

	/** Save one value, then let every row catch up with it. */
	private async commit<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
		if (this.plugin.settings[key] === value) return;
		this.plugin.settings[key] = value;
		await this.plugin.saveSettings();
		this.refresh();
	}

	private refresh(): void {
		this.refreshers = this.refreshers.filter((refresher) => refresher.el.isConnected);
		for (const refresher of this.refreshers) refresher.run();
		if (requireApiVersion("1.13.0")) this.refreshDomState();
	}

	/** Run now and after every change, for as long as the row is on screen. */
	private track(setting: Setting, run: () => void): void {
		this.refreshers.push({ el: setting.settingEl, run });
		run();
	}

	/** Show or clear the message under a field whose value was refused. */
	private report(setting: Setting, problem: string | null): void {
		setting.settingEl.toggleClass("reading-progress-setting-invalid", problem !== null);
		setting.infoEl.querySelector(".reading-progress-setting-error")?.remove();
		if (problem !== null) {
			setting.infoEl.createDiv({ cls: "reading-progress-setting-error", text: problem });
		}
	}

	/**
	 * Keep a field showing the stored value, except while it is being typed
	 * in. This is what makes the reset buttons and "restore all" work without
	 * rebuilding the page.
	 */
	private sync(setting: Setting, input: HTMLElement, show: () => void): void {
		this.track(setting, () => {
			if (input.ownerDocument.activeElement === input) return;
			show();
			this.report(setting, null);
		});
	}

	/** A button that puts one setting back, shown only when it has been changed. */
	private resettable(setting: Setting, key: keyof Settings): void {
		setting.addExtraButton((button) => {
			button
				.setIcon("rotate-ccw")
				.setTooltip("Restore default")
				.onClick(() => void this.commit(key, DEFAULT_SETTINGS[key]));
			this.track(setting, () => {
				button.extraSettingsEl.toggle(this.plugin.settings[key] !== DEFAULT_SETTINGS[key]);
			});
		});
	}

	/** Refuses a name already taken by another setting of the same kind. */
	private distinct(key: KeysOfType<string>): Validate<string> {
		const families: [KeysOfType<string>, string][][] = [
			[
				["pagesProperty", "total pages property"],
				["currentPageProperty", "current page property"],
				["statusProperty", "status property"],
				["rereadProperty", "re-read count property"],
			],
			[
				["unreadStatus", "unread status"],
				["readingStatus", "reading status"],
				["finishedStatus", "finished status"],
			],
		];
		const others = (families.find((family) => family.some(([name]) => name === key)) ?? []).filter(
			([name]) => name !== key,
		);

		return (value) => {
			const clash = others.find(
				([name]) => this.plugin.settings[name].toLowerCase() === value.toLowerCase(),
			);
			return clash ? `Already used as the ${clash[1]}.` : null;
		};
	}

	/** A text field. Emptying it restores the default. */
	private text(
		name: string,
		desc: string,
		key: KeysOfType<string>,
		options: {
			validate?: Validate<string>;
			placeholder?: string;
			visible?: () => boolean;
			wide?: boolean;
		} = {},
	): Row {
		const fallback = DEFAULT_SETTINGS[key];
		return {
			name,
			desc,
			visible: options.visible,
			build: (setting) => {
				setting.addText((text) => {
					text.setPlaceholder(options.placeholder ?? fallback).onChange((value) => {
						const trimmed = value.trim();
						const next = trimmed.length > 0 ? trimmed : fallback;
						const problem = options.validate?.(next) ?? null;
						this.report(setting, problem);
						if (problem === null) void this.commit(key, next);
					});
					if (options.wide) text.inputEl.addClass("reading-progress-setting-wide");
					this.sync(setting, text.inputEl, () => {
						text.setValue(this.plugin.settings[key]);
					});
				});
				this.resettable(setting, key);
			},
		};
	}

	/** A label template: a wide text field that refuses unknown placeholders. */
	private template(
		name: string,
		desc: string,
		key: KeysOfType<string>,
		tokens: readonly string[],
		placeholder: string,
		visible?: () => boolean,
	): Row {
		return this.text(name, `${desc} Placeholders: ${tokenList(tokens)}`, key, {
			placeholder,
			visible,
			wide: true,
			validate: (value) => {
				const unknown = unknownTokens(value, tokens);
				return unknown.length > 0
					? `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.join(" ")}`
					: null;
			},
		});
	}

	/** A whole-number field with a lower bound. */
	private number(
		name: string,
		desc: string,
		key: KeysOfType<number>,
		min: number,
		visible?: () => boolean,
	): Row {
		return {
			name,
			desc,
			visible,
			build: (setting) => {
				setting.addText((text) => {
					text.inputEl.type = "number";
					text.inputEl.min = String(min);
					text.inputEl.step = "1";
					text.setPlaceholder(String(DEFAULT_SETTINGS[key])).onChange((value) => {
						const parsed = Number(value.trim());
						const valid = value.trim().length > 0 && Number.isInteger(parsed) && parsed >= min;
						this.report(setting, valid ? null : `Enter a whole number, ${min} or more.`);
						if (valid) void this.commit(key, parsed);
					});
					this.sync(setting, text.inputEl, () => {
						text.setValue(String(this.plugin.settings[key]));
					});
				});
				this.resettable(setting, key);
			},
		};
	}

	private toggle(
		name: string,
		desc: string,
		key: KeysOfType<boolean>,
		visible?: () => boolean,
	): Row {
		return {
			name,
			desc,
			visible,
			build: (setting) => {
				setting.addToggle((toggle) => {
					toggle.onChange(async (value) => {
						await this.commit(key, value);
						// Rows that depend on this one appear and disappear;
						// before 1.13 that takes a rebuild.
						if (!requireApiVersion("1.13.0")) this.rebuild();
					});
					this.track(setting, () => {
						if (toggle.getValue() !== this.plugin.settings[key]) {
							toggle.setValue(this.plugin.settings[key]);
						}
					});
				});
			},
		};
	}

	private slider(
		name: string,
		desc: string,
		key: KeysOfType<number>,
		min: number,
		max: number,
	): Row {
		return {
			name,
			desc,
			build: (setting) => {
				setting.addSlider((slider) => {
					slider
						.setLimits(min, max, 1)
						.setInstant(true)
						.onChange((value) => void this.commit(key, value));
					this.track(setting, () => {
						if (slider.getValue() !== this.plugin.settings[key]) {
							slider.setValue(this.plugin.settings[key]);
						}
					});
				});
				this.resettable(setting, key);
			},
		};
	}

	/**
	 * A colour picker for a setting whose empty value means "follow the
	 * theme". Until a colour is picked, the swatch shows the theme's own.
	 */
	private color(name: string, desc: string, key: KeysOfType<string>, themeVariable: string): Row {
		return {
			name,
			desc,
			build: (setting) => {
				setting.addColorPicker((picker) => {
					// Showing the theme's colour must not be mistaken for a choice.
					let syncing = false;
					picker.onChange((value) => {
						if (!syncing) void this.commit(key, value);
					});
					this.track(setting, () => {
						const stored = this.plugin.settings[key];
						const shown = stored.length > 0 ? stored : themeColor(setting.settingEl, themeVariable);
						if (picker.getValue() === shown) return;
						syncing = true;
						picker.setValue(shown);
						syncing = false;
					});
				});
				this.resettable(setting, key);
			},
		};
	}

	/** The log's date format, with a live sample of today's date. */
	private dateFormat(visible: () => boolean): Row {
		const key = "historyDateFormat";
		return {
			name: "Log date format",
			desc: "Moment.js format, for example YYYY-MM-DD. Entries already in a log keep the format they were written in, and the pace only reads entries in the current one.",
			visible,
			build: (setting) => {
				const sample = setting.descEl.createDiv({ cls: "reading-progress-setting-sample" });
				sample.appendText("Today is written ");
				const sampleEl = sample.createEl("b");

				setting.addMomentFormat((format) => {
					format
						.setDefaultFormat(DEFAULT_SETTINGS[key])
						.setSampleEl(sampleEl)
						.onChange((value) => {
							const trimmed = value.trim();
							// A colon would end the date early: entries are `date: page`.
							const problem = trimmed.includes(":")
								? "The format cannot contain a colon, which separates the date from the page."
								: null;
							this.report(setting, problem);
							if (problem === null) {
								void this.commit(key, trimmed.length > 0 ? trimmed : DEFAULT_SETTINGS[key]);
							}
						});
					this.sync(setting, format.inputEl, () => {
						format.setValue(this.plugin.settings[key]);
						format.updateSample();
					});
				});
				this.resettable(setting, key);
			},
		};
	}

	/** Reports how many notes the tag and property names actually match. */
	private matchingNotes(): Row {
		return {
			name: "Matching notes",
			desc: "How many notes in this vault the tag and properties above find.",
			build: (setting) => {
				const result = setting.controlEl.createDiv({ cls: "reading-progress-setting-result" });
				this.track(setting, () => {
					const settings = this.plugin.settings;
					const tagged = collectGoalTotals(this.app, settings).booksTotal;
					const trackable = listBooks(this.app, settings).length;
					result.setText(
						tagged === 0
							? `No notes tagged #${settings.bookTag}`
							: `${tagged.toLocaleString()} tagged #${settings.bookTag} \u00b7 ${trackable.toLocaleString()} with a numeric "${settings.pagesProperty}"`,
					);
					result.toggleClass("is-empty", trackable === 0);
				});
			},
		};
	}

	/** A sample book drawn with the current settings. */
	private preview(): Row {
		return {
			name: "Preview",
			desc: "A book 349 pages into 688, as a progress block draws it.",
			build: (setting) => {
				setting.settingEl.addClass("reading-progress-setting-preview");
				const box = setting.controlEl.createDiv({ cls: "reading-progress" });

				this.track(setting, () => {
					const settings = this.plugin.settings;
					box.empty();
					box.createDiv({
						cls: "reading-progress-label",
						text: progressLabel(settings.progressLabel, SAMPLE, "Dune", settings.wordsPerPage)
							.text,
					});
					renderBar(box, {
						fraction: SAMPLE.fraction,
						complete: false,
						ariaLabel: "Preview of a progress bar",
						valueNow: SAMPLE.current,
						valueMax: SAMPLE.total ?? 0,
						settings,
					});
					if (settings.showPercentage) {
						box.createDiv({
							cls: "reading-progress-percent",
							text: formatPercent(SAMPLE.fraction),
						});
					}
					if (!settings.showButtons) return;

					const { smallStep, largeStep } = settings;
					const steps = settings.showMinusButtons
						? [-largeStep, -smallStep, smallStep, largeStep]
						: [smallStep, largeStep];
					const labels = [...new Set(steps)].map((step) => (step > 0 ? `+${step}` : String(step)));
					if (settings.showSetButton) labels.push("Page\u2026");

					const row = box.createDiv({ cls: "reading-progress-buttons" });
					for (const label of labels) {
						row.createEl("button", { text: label, cls: "reading-progress-button" }).disabled = true;
					}
				});
			},
		};
	}

	private restoreAll(): Row {
		return {
			name: "Restore all defaults",
			desc: "Put every setting on this page back to its default. Notes are not changed.",
			build: (setting) => {
				setting.addButton((button) => {
					let armed = false;
					const disarm = () => {
						armed = false;
						button.setButtonText("Restore defaults");
					};
					disarm();
					button.buttonEl.addClass("mod-warning");
					button.onClick(async () => {
						if (!armed) {
							armed = true;
							button.setButtonText("Click again to confirm");
							window.setTimeout(disarm, 4000);
							return;
						}
						disarm();
						Object.assign(this.plugin.settings, DEFAULT_SETTINGS);
						await this.plugin.saveSettings();
						this.refresh();
						if (!requireApiVersion("1.13.0")) this.rebuild();
					});
				});
			},
		};
	}
}

/** Resolve a theme colour variable to the hex string a colour picker needs. */
function themeColor(context: HTMLElement, variable: string): string {
	// Probed on the body: a row is not attached yet while it is being built.
	const probe = context.ownerDocument.body.createDiv();
	probe.style.color = `var(${variable})`;
	const channels = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) ?? [];
	probe.remove();
	if (channels.length < 3) return "#888888";
	return `#${channels
		.slice(0, 3)
		.map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0"))
		.join("")}`;
}
