// The wikilink builder for card titles. The Markdown source must only ever be
// "[[" + vault path without .md + "]]": no title, no alias, nothing that can
// re-target or break the link.
import { describe, expect, test } from "vitest";
import { taskLinkpath, taskWikilink } from "../src/model/taskLink";

describe("taskLinkpath / taskWikilink", () => {
	test("strips the .md extension and wraps the full vault path", () => {
		expect(taskLinkpath("TaskNotes/Tasks/Write report.md")).toBe("TaskNotes/Tasks/Write report");
		expect(taskWikilink("TaskNotes/Tasks/Write report.md")).toBe("[[TaskNotes/Tasks/Write report]]");
	});

	test("strips exactly one trailing lowercase .md", () => {
		expect(taskLinkpath("a.md.md")).toBe("a.md");
		expect(taskLinkpath("notes/plan.markdown")).toBe("notes/plan.markdown");
		expect(taskLinkpath("x.MD")).toBe("x.MD");
		expect(taskWikilink("a.md.md")).toBe("[[a.md]]");
	});

	test.each(["a|b.md", "a#b.md", "a^b.md", "a[b].md", "a]b.md", "a[b.md", "line\nbreak.md", "car\rriage.md"])(
		"a link-breaking character in %j gives null",
		(path) => {
			expect(taskLinkpath(path)).toBeNull();
			expect(taskWikilink(path)).toBeNull();
		},
	);

	test.each(["", ".md"])("an empty linkpath from %j gives null", (path) => {
		expect(taskLinkpath(path)).toBeNull();
		expect(taskWikilink(path)).toBeNull();
	});

	test.each([undefined, null, 42, {}])("non-string input %o gives null", (value) => {
		expect(taskLinkpath(value)).toBeNull();
		expect(taskWikilink(value)).toBeNull();
	});

	test("the output is only [[linkpath]], with no alias or extra syntax", () => {
		for (const path of ["Tasks/Foo.md", "Tasks/with spaces and (parens).md", "Tasks/émoji 🚀.md"]) {
			const link = taskWikilink(path);
			const linkpath = taskLinkpath(path);
			expect(link).toBe("[[" + String(linkpath) + "]]");
			expect(link?.slice(2, -2)).not.toMatch(/[[\]|#^\r\n]/);
		}
	});
});
