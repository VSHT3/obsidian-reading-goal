import { App, PluginSettingTab, Setting } from "obsidian";
import type ReadingProgressPlugin from "./main";
import { DEFAULT_SETTINGS, type ReadingProgressSettings } from "./settings";

export class ReadingProgressSettingTab extends PluginSettingTab {
	private readonly plugin: ReadingProgressPlugin;

	constructor(app: App, plugin: ReadingProgressPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Properties").setHeading();

		this.text(
			"Total pages property",
			"Frontmatter key holding the book's full length.",
			"pagesProperty",
			DEFAULT_SETTINGS.pagesProperty,
		);
		this.text(
			"Current page property",
			"Frontmatter key holding your position. This is the value the buttons and commands change.",
			"currentPageProperty",
			DEFAULT_SETTINGS.currentPageProperty,
		);
		this.text(
			"Status property",
			"Frontmatter key holding the reading status.",
			"statusProperty",
			DEFAULT_SETTINGS.statusProperty,
		);
		this.text(
			"Book tag",
			"Notes with this tag count toward the goal. Written without the leading hash.",
			"bookTag",
			DEFAULT_SETTINGS.bookTag,
		);

		new Setting(containerEl).setName("Status").setHeading();

		this.text(
			"Unread status value",
			"Written when a book is reset to page zero, and recognised as not yet started.",
			"unreadStatus",
			DEFAULT_SETTINGS.unreadStatus,
		);
		this.text(
			"Reading status value",
			"Written when a book has progress but is not finished.",
			"readingStatus",
			DEFAULT_SETTINGS.readingStatus,
		);
		this.text(
			"Finished status value",
			"Written when your position reaches the last page.",
			"finishedStatus",
			DEFAULT_SETTINGS.finishedStatus,
		);

		new Setting(containerEl)
			.setName("Update status automatically")
			.setDesc(
				"Set the status to finished on reaching the last page, and back to reading if you move earlier.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoStatus).onChange(async (value) => {
					this.plugin.settings.autoStatus = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Steps").setHeading();

		this.number(
			"Small step",
			"Pages moved by the fine-grained buttons and commands.",
			"smallStep",
			DEFAULT_SETTINGS.smallStep,
			1,
		);
		this.number(
			"Large step",
			"Pages moved by the coarse buttons and commands.",
			"largeStep",
			DEFAULT_SETTINGS.largeStep,
			1,
		);

		new Setting(containerEl).setName("Goal").setHeading();

		this.number(
			"Page goal",
			"Total pages you are aiming for across every book in the vault.",
			"pageGoal",
			DEFAULT_SETTINGS.pageGoal,
			1,
		);
		this.number(
			"Words per page",
			"Used to estimate words read. Set to zero to hide the estimate.",
			"wordsPerPage",
			DEFAULT_SETTINGS.wordsPerPage,
			0,
		);

		new Setting(containerEl)
			.setName("Count books in progress")
			.setDesc(
				"Add pages read in unfinished books to the goal total, rather than counting finished books only.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.countBooksInProgress)
					.onChange(async (value) => {
						this.plugin.settings.countBooksInProgress = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Show percentage")
			.setDesc("Display the numeric percentage beside the bar.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showPercentage).onChange(async (value) => {
					this.plugin.settings.showPercentage = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Show buttons")
			.setDesc(
				"Display the step buttons inside the progress block. Commands keep working either way.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showButtons).onChange(async (value) => {
					this.plugin.settings.showButtons = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Show rewind buttons")
			.setDesc(
				"Include the negative steps. Turn off for advance-only controls.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showMinusButtons).onChange(async (value) => {
					this.plugin.settings.showMinusButtons = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private text(
		name: string,
		desc: string,
		key: {
			[K in keyof ReadingProgressSettings]: ReadingProgressSettings[K] extends string
				? K
				: never;
		}[keyof ReadingProgressSettings],
		placeholder: string,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings[key] = trimmed.length > 0 ? trimmed : placeholder;
						await this.plugin.saveSettings();
					}),
			);
	}

	private number(
		name: string,
		desc: string,
		key: {
			[K in keyof ReadingProgressSettings]: ReadingProgressSettings[K] extends number
				? K
				: never;
		}[keyof ReadingProgressSettings],
		fallback: number,
		min: number,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(String(fallback))
					.setValue(String(this.plugin.settings[key]))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value.trim(), 10);
						this.plugin.settings[key] =
							Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
						await this.plugin.saveSettings();
					}),
			);
	}
}
