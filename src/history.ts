/**
 * Optional dated reading log kept in the note body.
 *
 * A single `currentpage` number cannot answer "what did I read in March", so
 * the plugin can additionally append a dated line each time the position
 * changes. One entry per day is rewritten in place rather than appended, so
 * holding a hotkey produces one line, not forty.
 */

const ENTRY = /^\s*-\s*([^:]+?)\s*:\s*(\d+)\s*$/;

function headingPattern(heading: string): RegExp {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, "i");
}

/**
 * Insert or update today's entry, returning the new note contents.
 *
 * The section is created at the end of the note when absent. Frontmatter is
 * never touched, because the heading search starts after it.
 */
export function updateLog(
	content: string,
	heading: string,
	date: string,
	page: number,
): string {
	const lines = content.split("\n");
	const matcher = headingPattern(heading);

	// Skip frontmatter so a heading-like line inside YAML cannot match.
	let start = 0;
	if (lines[0]?.trim() === "---") {
		const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
		if (close !== -1) start = close + 1;
	}

	let headingIndex = -1;
	let headingLevel = 2;
	for (let index = start; index < lines.length; index += 1) {
		const match = matcher.exec(lines[index]);
		if (match) {
			headingIndex = index;
			headingLevel = match[1].length;
			break;
		}
	}

	const entry = `- ${date}: ${page}`;

	if (headingIndex === -1) {
		const body = content.replace(/\s+$/, "");
		const separator = body.length > 0 ? "\n\n" : "";
		return `${body}${separator}## ${heading}\n\n${entry}\n`;
	}

	// The section runs to the next heading of the same or higher level.
	let end = lines.length;
	for (let index = headingIndex + 1; index < lines.length; index += 1) {
		const match = /^(#{1,6})\s+/.exec(lines[index]);
		if (match && match[1].length <= headingLevel) {
			end = index;
			break;
		}
	}

	let lastEntry = -1;
	for (let index = headingIndex + 1; index < end; index += 1) {
		const match = ENTRY.exec(lines[index]);
		if (!match) continue;
		lastEntry = index;
		if (match[1] === date) {
			lines[index] = entry;
			return lines.join("\n");
		}
	}

	if (lastEntry !== -1) {
		lines.splice(lastEntry + 1, 0, entry);
		return lines.join("\n");
	}

	// No entries yet: sit below the blank line that follows the heading,
	// inserting one when the heading is followed immediately by content.
	let insertAt = headingIndex + 1;
	while (insertAt < end && lines[insertAt].trim() === "") insertAt += 1;

	const needsBlank = insertAt === headingIndex + 1;
	lines.splice(insertAt, 0, ...(needsBlank ? ["", entry] : [entry]));
	return lines.join("\n");
}
