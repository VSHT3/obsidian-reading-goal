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

interface Section {
	/** Line index of the heading. */
	heading: number;
	/** Line index one past the section's last line. */
	end: number;
}

/** Locate the log section, or null when the note has none. */
function findSection(lines: string[], heading: string): Section | null {
	const matcher = headingPattern(heading);

	// Skip frontmatter so a heading-like line inside YAML cannot match.
	let start = 0;
	if (lines[0]?.trim() === "---") {
		const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
		if (close !== -1) start = close + 1;
	}

	for (let index = start; index < lines.length; index += 1) {
		const match = matcher.exec(lines[index]);
		if (!match) continue;

		// The section runs to the next heading of the same or higher level.
		const level = match[1].length;
		let end = lines.length;
		for (let next = index + 1; next < lines.length; next += 1) {
			const other = /^(#{1,6})\s+/.exec(lines[next]);
			if (other && other[1].length <= level) {
				end = next;
				break;
			}
		}
		return { heading: index, end };
	}

	return null;
}

export interface LogEntry {
	/** The date exactly as written, in the configured format. */
	date: string;
	page: number;
}

/** Every entry in the note's log, in the order written. */
export function readLog(content: string, heading: string): LogEntry[] {
	const lines = content.split("\n");
	const section = findSection(lines, heading);
	if (!section) return [];

	const entries: LogEntry[] = [];
	for (let index = section.heading + 1; index < section.end; index += 1) {
		const match = ENTRY.exec(lines[index]);
		if (match) entries.push({ date: match[1], page: Number.parseInt(match[2], 10) });
	}
	return entries;
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
	const section = findSection(lines, heading);
	const entry = `- ${date}: ${page}`;

	if (!section) {
		const body = content.replace(/\s+$/, "");
		const separator = body.length > 0 ? "\n\n" : "";
		return `${body}${separator}## ${heading}\n\n${entry}\n`;
	}

	const headingIndex = section.heading;
	const end = section.end;

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
