/**
 * Substitutes `{token}` placeholders in a custom label.
 *
 * Unrecognised tokens are left in place and reported, so a typo is visible in
 * the note rather than silently rendering as empty text.
 */
export interface TemplateResult {
	text: string;
	unknown: string[];
}

const TOKEN = /\{([a-z]+)\}/gi;

export function applyTemplate(
	template: string,
	values: Readonly<Record<string, string>>,
): TemplateResult {
	const unknown: string[] = [];

	const text = template.replace(TOKEN, (match, rawName: string) => {
		const name = rawName.toLowerCase();
		if (name in values) return values[name];
		unknown.push(`{${rawName}}`);
		return match;
	});

	return { text, unknown };
}
