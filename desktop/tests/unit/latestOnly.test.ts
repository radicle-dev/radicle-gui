import { expect, test } from "vitest";

import { latestOnly } from "@app/lib/latestOnly";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

test("a load that finishes after a later one is dropped", async () => {
  const applied: string[] = [];
  const load = latestOnly<string>(value => applied.push(value));
  const older = deferred<string>();
  const newer = deferred<string>();

  const first = load(() => older.promise);
  const second = load(() => newer.promise);
  newer.resolve("newer");
  await second;
  older.resolve("older");
  await first;

  expect(applied).toEqual(["newer"]);
});

test("loads that finish in order all apply", async () => {
  const applied: string[] = [];
  const load = latestOnly<string>(value => applied.push(value));

  await load(async () => "first");
  await load(async () => "second");

  expect(applied).toEqual(["first", "second"]);
});
