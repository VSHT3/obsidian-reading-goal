# Reading Progress

An Obsidian plugin that tracks reading progress in note properties.

It renders a progress bar scaled to a book's own page count, moves your position
from the command palette or a hotkey, keeps the status property in step, and
totals every book in the vault against a goal.

## Why this exists

Three things were missing from every plugin in the community registry:

- A progress bar whose maximum is read from a property. Meta Bind's progress
  bar takes a literal `maxValue`, so the scale cannot follow a book's `pages`.
- Command-palette and hotkey actions that move a frontmatter number. Meta Bind
  registers no commands at all; its buttons are click-only.
- A page goal. Bookshelf and Dogear both report what you have read; neither
  lets you set a target and watch it fill.

Everything else already exists and is not reimplemented here. Library views,
cover grids and per-year statistics belong to
[Bookshelf](https://github.com/weph/obsidian-bookshelf); cross-note querying
belongs to core Bases, via the base this plugin can generate for you.

## Note format

The plugin reads three properties. Every key is configurable in settings; these
are the defaults.

```yaml
---
tags:
  - Book
pages: 435        # total length
currentpage: 30   # your position
status: reading   # to read | reading | finished
---
```

## The progress bar

Put an empty fenced block in a book note:

````markdown
```reading-progress
```
````

It renders the position, a bar scaled to `pages`, the percentage, and the
`-5 / -1 / +1 / +5` buttons. The bar repaints as soon as the property changes,
whether you edited it in the properties panel, clicked a button, or ran a
command.

The block reports what is wrong rather than rendering nothing: a note with no
usable `pages` property says so.

## The goal

Put an empty fenced block in a dashboard note:

````markdown
```reading-goal
```
````

It sums every note carrying the book tag and compares the total to your goal:

```
1,817 of 3,000 pages.
[============================        ] 60.6%
3 finished · 2 in progress · 5 on the shelf · ~763,140 words
```

Finished books contribute their full length. Books in progress contribute the
pages you have actually read, so a book you are 300 pages into is not worth
zero until the day you finish it. Turn that off with **Count books in
progress** if you would rather count only completed books.

A book counts as finished when its status matches the finished value *or* its
position has reached the last page, so books whose status was never updated are
still counted, and never counted twice.

## Commands

All position commands appear in the palette only when the active note has a
usable page count. None ships with a default hotkey; bind what you want.

| Command | Effect |
| --- | --- |
| Advance position by small step | `+1` by default |
| Rewind position by small step | `-1` by default |
| Advance position by large step | `+5` by default |
| Rewind position by large step | `-5` by default |
| Set position to a specific page | Opens a prompt |
| Mark book as finished | Jumps to the last page |
| Insert book progress block | Opens the insert modal |
| Insert vault goal block | Opens the insert modal |
| Create books base | Writes `Books.base` and opens it |
| Show progress toward page goal | Notice with the vault total |

The four step commands are `repeatable`, so holding the hotkey scrubs through
the book. Every step lands: positions are resolved inside the frontmatter
transaction rather than read from the metadata cache, which lags writes.

## Ribbon

The ribbon icon opens a menu showing the current goal total and book counts,
with entries to insert a block at the cursor, create the base, and jump to the
plugin's settings. On macOS this renders as a native menu.

## Block options

Both blocks take `key: value` lines. Anything omitted follows the settings, so
a bare block stays in step with your configuration; anything set is pinned to
that block. Unknown keys are reported in the rendered output rather than
ignored silently. Lines starting with `#` are comments.

````markdown
```reading-progress
file: Dune
small: 10
large: 50
color: #00A5FF
height: 22
percent: false
```
````

| `reading-progress` | Meaning |
| --- | --- |
| `file` | Track another note. Accepts a name or `[[wikilink]]` |
| `pages`, `current`, `status` | Override the property names |
| `small`, `large` | Override the step sizes |
| `buttons` | Show the button row at all |
| `plus`, `minus` | Show the advance / rewind buttons separately |
| `percent` | Show the percentage |
| `label` | `false` to hide, or a template — see below |
| `color`, `height` | Any CSS colour; bar height in pixels |

| `reading-goal` | Meaning |
| --- | --- |
| `goal` | Page target for this block |
| `tag` | Book tag to count |
| `words` | Words per page, `0` hides the estimate |
| `inprogress` | Count unfinished books |
| `details` | Show the counts line |
| `percent`, `label`, `color`, `height` | As above |

Booleans accept `true/false`, `yes/no`, `on/off`, `1/0`, `show/hide`.

`file:` makes a dashboard of several books possible, each with working
buttons; the buttons write to the tracked note, not the note they sit in.

`minus: false` gives advance-only controls, which suits a book you only ever
move forward in. `plus: false` does the reverse. Both default to the **Show
rewind buttons** setting.

## Custom labels

`label` takes any text, with `{token}` placeholders:

````markdown
```reading-progress
label: {title} — {current}/{total} ({percent}), {remaining} to go
```
````

| `reading-progress` | `reading-goal` |
| --- | --- |
| `{current}` `{total}` `{remaining}` | `{read}` `{goal}` `{remaining}` |
| `{percent}` `{title}` `{status}` | `{percent}` `{books}` |
| `{words}` | `{finished}` `{inprogress}` `{words}` |

Numbers arrive already formatted with thousands separators. Tokens are
case-insensitive. A token that does not exist is left visible in the note and
named in an "ignored" line, so a typo is obvious rather than rendering blank.
`label: false` still hides the label entirely.

## The insert modal

**Insert book progress block** and **Insert vault goal block**, or the ribbon
menu, open a modal that builds a block and drops it at the cursor. It shows a
live preview of the exact text, and writes only the options that differ from
your settings, so blocks stay short.

The **Another note** field autocompletes against the vault, ranking notes with
the book tag first — it does not restrict to them, so a note can be pointed at
before it is tagged.

## Status handling

With **Update status automatically** on:

- reaching the last page writes the finished value
- moving off the last page writes the reading value
- advancing from zero, from an unread status, or from a blank status writes the
  reading value
- returning to page zero writes the unread value

Only statuses the plugin manages are rewritten. A bespoke value such as
`abandoned` is left alone.

Positions are always clamped to `0 … pages`, whichever way they are set.

## The base

**Create books base** writes `Books.base` at the vault root, generated against
your configured property names, and opens it. Five views over every note
carrying the book tag:

- **Reading now** — a bar, percentage, page, length and pages left, with sums
- **Finished** — with total pages and estimated words
- **To read** — the queue, with total pages
- **Shelf** — a card grid
- **Progress bars** — this plugin's own Bases view

Two of those render bars, by different means.

The **table** bar is a formula using the core `html()` function:

```yaml
bar: 'if(pages, html("<progress value=\"" + currentpage + "\" max=\"" + pages + "\"></progress>"), "")'
```

That is plain Bases. It keeps working if this plugin is disabled or removed.

**Progress bars** is a view type the plugin registers with `registerBasesView`,
drawing a themed bar per row plus a total line. Bases still owns the filtering,
sorting and grouping; the view only draws, and repaints when Bases pushes new
data. It needs Obsidian 1.10 or later, and disappears if Bases is turned off in
the vault — the rest of the plugin is unaffected.

Because the base is generated from your settings, regenerate it after renaming
a property: delete the file and run the command again.

## Settings

Property names (`pages`, `currentpage`, `status`, book tag), the three status
values, both step sizes, the page goal, words per page, whether in-progress
books count, and whether the percentage, buttons and rewind buttons are shown.

## Development

```sh
npm install
npm run dev     # watch build
npm run build   # typecheck + production bundle
npm test        # behavioural tests, no Obsidian required
```

`npm test` runs the real plugin logic against an in-memory stand-in for the
Obsidian APIs (`test/obsidian-stub.ts`), covering property coercion, clamping,
status transitions, malformed-frontmatter handling, concurrent repeated moves,
and goal aggregation.

To install locally, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/reading-progress/`.

## Licence

MIT
