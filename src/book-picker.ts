import { App, FuzzySuggestModal, type FuzzyMatch, type TFile } from "obsidian";
import { formatPercent } from "./bar";
import { listBooks, type BookEntry } from "./progress";
import type { ReadingProgressSettings } from "./settings";

/** Picks a book from anywhere in the vault, books in progress first. */
export class BookPickerModal extends FuzzySuggestModal<BookEntry> {
	private readonly settings: ReadingProgressSettings;
	private readonly onChoose: (file: TFile) => void;

	constructor(
		app: App,
		settings: ReadingProgressSettings,
		placeholder: string,
		onChoose: (file: TFile) => void,
	) {
		super(app);
		this.settings = settings;
		this.onChoose = onChoose;
		this.setPlaceholder(placeholder);
		this.emptyStateText = `No notes tagged #${settings.bookTag.replace(/^#/, "")} with a "${settings.pagesProperty}" property.`;
	}

	getItems(): BookEntry[] {
		return listBooks(this.app, this.settings);
	}

	getItemText(book: BookEntry): string {
		return book.file.basename;
	}

	renderSuggestion(match: FuzzyMatch<BookEntry>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		const { state, finished } = match.item;
		const total = state.total ?? 0;
		el.createDiv({
			cls: "reading-progress-suggest-path",
			text: finished
				? `Finished \u00b7 ${total.toLocaleString()} pages`
				: state.current === 0
					? `Not started \u00b7 ${total.toLocaleString()} pages`
					: `Page ${state.current.toLocaleString()} of ${total.toLocaleString()} \u00b7 ${formatPercent(state.fraction)}`,
		});
	}

	onChooseItem(book: BookEntry): void {
		this.onChoose(book.file);
	}
}
