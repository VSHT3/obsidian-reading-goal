import { AbstractInputSuggest, type App, type TFile } from "obsidian";

/**
 * File autocomplete for fields that name another note.
 *
 * Ranks notes that carry the book tag first, then everything else, so the
 * field is useful without being a hard filter — a note can be pointed at
 * before it has been tagged.
 */
export class NoteSuggest extends AbstractInputSuggest<TFile> {
	private readonly preferred: (file: TFile) => boolean;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		preferred: (file: TFile) => boolean,
	) {
		super(app, inputEl);
		this.preferred = preferred;
		this.limit = 20;
	}

	protected getSuggestions(query: string): TFile[] {
		const needle = query.trim().toLowerCase();
		const files = this.app.vault.getMarkdownFiles();

		const matches = needle.length === 0
			? files
			: files.filter(
					(file) =>
						file.basename.toLowerCase().includes(needle) ||
						file.path.toLowerCase().includes(needle),
				);

		return matches.sort((a, b) => {
			const byTag = Number(this.preferred(b)) - Number(this.preferred(a));
			if (byTag !== 0) return byTag;
			return a.basename.localeCompare(b.basename);
		});
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ text: file.basename });
		if (file.parent && file.parent.path !== "/") {
			el.createDiv({ cls: "reading-progress-suggest-path", text: file.parent.path });
		}
	}

	// selectSuggestion is deliberately not overridden: the base implementation
	// is what dispatches the onSelect callback, and overriding it silently
	// disables every consumer's handler.
}
