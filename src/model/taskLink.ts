/*
 * Wikilink source for a card title, rendered through Obsidian's MarkdownRenderer so
 * TaskNotes' task-link post-processor can turn it into its chip.
 *
 * Why no alias: when the link text equals the link path, as with [[Tasks/Foo]],
 * TaskNotes passes no display-text override and the chip shows the task's own title.
 * Its disableOverlayOnAlias check also treats that text as default text, not an alias,
 * so the chip always appears when the overlay setting is on. Keeping the title out of
 * the Markdown source also means it never needs escaping.
 *
 * Pure module with no Obsidian imports, so Vitest can load it in Node.
 */

/** Characters that break or re-target Obsidian wikilink syntax. */
const LINK_BREAKING = /[[\]|#^\r\n]/;

/**
 * The vault path without its one trailing ".md": resolves unambiguously through
 * getFirstLinkpathDest with an empty sourcePath. Null for a non-string, an empty
 * result, or a path containing any of [ ] | # ^ or a line break.
 */
export function taskLinkpath(taskPath: unknown): string | null {
	if (typeof taskPath !== "string") return null;
	const linkpath = taskPath.endsWith(".md") ? taskPath.slice(0, -3) : taskPath;
	if (linkpath === "" || LINK_BREAKING.test(linkpath)) return null;
	return linkpath;
}

/** "[[" + linkpath + "]]", or null when taskLinkpath gives null. */
export function taskWikilink(taskPath: unknown): string | null {
	const linkpath = taskLinkpath(taskPath);
	return linkpath === null ? null : "[[" + linkpath + "]]";
}
