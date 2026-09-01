/**
 * Minimal stand-in for the parts of the Obsidian runtime that src/progress.ts
 * touches. Enough to exercise the real logic outside the app.
 */

export class TFile {
	path: string;
	basename: string;
	extension = "md";

	constructor(path: string) {
		this.path = path;
		this.basename = path.replace(/^.*\//, "").replace(/\.md$/, "");
	}
}

export interface CachedMetadata {
	frontmatter?: Record<string, unknown>;
}

export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export function getAllTags(cache: CachedMetadata): string[] | null {
	const raw = cache.frontmatter?.tags;
	if (!raw) return null;
	const list = Array.isArray(raw) ? raw : [raw];
	return list.map((tag) => `#${String(tag).replace(/^#/, "")}`);
}

/** Fixed clock, so log dates are deterministic in tests. */
export const FIXED_DATE = "2026-09-01";

export function moment(): { format: (pattern: string) => string } {
	return { format: () => FIXED_DATE };
}

/** A vault of in-memory notes with frontmatter, mimicking the real APIs. */
export class FakeApp {
	private readonly files = new Map<string, Record<string, unknown>>();
	/** Set a path here to make processFrontMatter throw, as malformed YAML does. */
	malformed: string | null = null;

	add(path: string, frontmatter: Record<string, unknown>): TFile {
		this.files.set(path, { ...frontmatter });
		return new TFile(path);
	}

	frontmatterOf(path: string): Record<string, unknown> {
		const found = this.files.get(path);
		if (!found) throw new Error(`no such note: ${path}`);
		return found;
	}

	readonly metadataCache = {
		getFileCache: (file: TFile): CachedMetadata | null => {
			const frontmatter = this.files.get(file.path);
			return frontmatter ? { frontmatter } : null;
		},
	};

	/** Note bodies, keyed by path. Only touched by the reading log. */
	private readonly bodies = new Map<string, string>();

	body(path: string): string {
		return this.bodies.get(path) ?? "";
	}

	setBody(path: string, content: string): void {
		this.bodies.set(path, content);
	}

	readonly vault = {
		getMarkdownFiles: (): TFile[] => [...this.files.keys()].map((path) => new TFile(path)),
		process: async (file: TFile, fn: (content: string) => string): Promise<string> => {
			const next = fn(this.bodies.get(file.path) ?? "");
			this.bodies.set(file.path, next);
			return next;
		},
	};

	readonly fileManager = {
		processFrontMatter: async (
			file: TFile,
			fn: (frontmatter: Record<string, unknown>) => void,
		): Promise<void> => {
			if (this.malformed === file.path) {
				const error = new Error("Nested mappings are not allowed");
				error.name = "YAMLParseError";
				throw error;
			}
			const frontmatter = this.files.get(file.path);
			if (!frontmatter) throw new Error(`no such note: ${file.path}`);
			fn(frontmatter);
		},
	};
}
