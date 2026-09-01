import type { ReadingProgressSettings } from "./settings";

/**
 * The bundled Base, generated against the configured property names.
 *
 * The `bar` formula uses the core `html()` function, so the table renders a
 * progress bar even in vaults where this plugin is disabled. The final view is
 * the plugin's own Bases view type, which draws richer bars.
 */
export function baseTemplate(settings: ReadingProgressSettings): string {
	const pages = settings.pagesProperty;
	const current = settings.currentPageProperty;
	const status = settings.statusProperty;
	const words = settings.wordsPerPage;

	return `filters:
  and:
    - file.hasTag("${settings.bookTag}")
formulas:
  percent: 'if(${pages}, ((${current} / ${pages}) * 100).round(0) + "%", "")'
  remaining: 'if(${pages}, ${pages} - ${current}, "")'
  words: 'if(${pages}, ${pages} * ${words}, "")'
  bar: 'if(${pages}, html("<progress value=\\"" + ${current} + "\\" max=\\"" + ${pages} + "\\"></progress>"), "")'
properties:
  note.${current}:
    displayName: Page
  note.${pages}:
    displayName: Length
  note.${status}:
    displayName: Status
  formula.bar:
    displayName: Progress
  formula.percent:
    displayName: "%"
  formula.remaining:
    displayName: Left
  formula.words:
    displayName: Words
views:
  - type: table
    name: Reading now
    filters:
      and:
        - '${status} == "${settings.readingStatus}"'
    order:
      - file.name
      - formula.bar
      - formula.percent
      - note.${current}
      - note.${pages}
      - formula.remaining
    sort:
      - property: formula.percent
        direction: DESC
    summaries:
      note.${current}: Sum
      formula.remaining: Sum

  - type: table
    name: Finished
    filters:
      and:
        - '${status} == "${settings.finishedStatus}"'
    order:
      - file.name
      - note.${pages}
    sort:
      - property: file.mtime
        direction: DESC
    summaries:
      note.${pages}: Sum
      formula.words: Sum

  - type: table
    name: To read
    filters:
      and:
        - '${status} == "${settings.unreadStatus}"'
    order:
      - file.name
      - note.${pages}
    sort:
      - property: file.name
        direction: ASC
    summaries:
      note.${pages}: Sum

  - type: cards
    name: Shelf
    order:
      - file.name
      - formula.percent

  - type: reading-progress
    name: Progress bars
    filters:
      and:
        - '${current} > 0'
`;
}
