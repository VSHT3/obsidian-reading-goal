# Changelog

## 1.3.2

- New plugin description and README: the plugin tracks anything with a total and a current number, and the install steps point at the community directory. No code changes.

## 1.3.1

- Typed the frontmatter and settings the plugin reads, which clears most of the directory review's warnings. Nothing changes in use.

## 1.3.0

### Added

- The page prompt takes a page (`437`), a move (`+25`, `-10`) or a percentage (`50%`), shows the result before you confirm, and has step buttons and **Mark finished**.
- A **Page…** button in every progress block opens the prompt.
- **Update position for any book** and **Open a book** pick a book from anywhere in the vault.
- **Track this note as a book** sets up a note that has no page count. A progress block on such a note shows a **Set up as a book** button.
- A goal deadline, as a setting and as the `deadline` block option. The goal block, the ribbon menu and the goal notice show the days left and the pages a day needed.
- A reading pace under each book's bar, worked out from the reading log.
- The open book's position in the status bar. A click opens the page prompt.
- **Set reading position…** in a book note's file menu.
- Settings for bar colour, completed colour, bar height, label text for books and for the goal, status bar text, the page button, the goal's details line, the pace window and the location of the books base.
- New block options: `set`, `pace` and `deadline`.

### Changed

- The ribbon menu now has actions for the open book, the two pickers and both insert commands.
- The settings tab has a live preview, a count of the notes your tag and property names match, a message when a value cannot be saved, and buttons that restore defaults. On Obsidian 1.13 and later its settings appear in settings search.
- The default page goal for a new install is 10,000. A goal you have already set is kept.
- Buttons are larger on phones and tablets.
- Notices and the ribbon tooltip say "Reading Goal".

### Fixed

- Starting a re-read no longer removes the book's pages from the goal total.
- The insert form keeps the colour and height you typed when you switch the label on or off.
- Bars in the **Progress bars** view are the same length in every row.

## 1.2.0

- Renamed the plugin to Reading Goal.

## 1.1.1

- Raised the minimum Obsidian version to 1.10.0.

## 1.1.0

- Added the reading log and re-reads.

## 1.0.0

- First version: the progress and goal blocks, position commands, and the books base.
