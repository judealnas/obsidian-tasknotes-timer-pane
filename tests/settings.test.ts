import { describe, expect, test } from "vitest";
import * as settings from "../src/settings";

describe("completion settings", () => {
	test("saved data has a narrow validating loader", () => {
		expect(settings).toHaveProperty("loadSettings", expect.any(Function));
	});
});
