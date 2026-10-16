// RED placeholder: replaced by the real plugin-scoped pause store in the GREEN commit.
export class PauseStore {
	constructor(_deps: { log: (message: string) => void }) {}
	load(_records: readonly unknown[]): void {}
	records(): unknown[] { return []; }
}
