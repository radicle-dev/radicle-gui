import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { mappedWrites, writtenKeys } from "@app/lib/writes";

// Commands that read, or write data the query cache doesn't hold. A new
// command has to be added here or to `mappedWrites`, so that a write which
// changes cached data can't be forgotten.
const outsideCache = [
  // Reads
  "activity_by_issue",
  "activity_by_patch",
  "actor",
  "actor_profile_history",
  "actors_of_key",
  "alias",
  "artifact_binaries",
  "artifact_node_running",
  "artifact_node_status",
  "board_links",
  "check_radicle_cli",
  "closed_actor_revisions",
  "comment_threads_by_issue_id",
  "compute_artifact_cid",
  "config",
  "decode_enrollment",
  "diff_stats",
  "get_commit_diff",
  "get_diff",
  "get_diff_text",
  "get_embed",
  "git_info",
  "identity_by_repo",
  "issue_by_id",
  "joinable_actor",
  "list_boards",
  "list_canonical_tags",
  "list_commits",
  "list_issues",
  "list_jobs",
  "list_notifications",
  "list_patches",
  "list_releases",
  "list_repo_commits",
  "list_repo_refs",
  "list_repos",
  "list_repos_summary",
  "notification_count",
  "patch_by_id",
  "release_by_id",
  "release_counts",
  "repo_blob",
  "repo_blob_bytes",
  "repo_by_id",
  "repo_commit",
  "repo_commit_count",
  "repo_commits_by_prefix",
  "repo_count",
  "repo_readme",
  "repo_split_tree_path",
  "repo_tree",
  "revisions_by_patch",
  "search_aliases",
  "seeded_artifacts",
  "seeded_not_replicated",
  "version",
  // App and node state
  "authenticate",
  "init",
  "pick_artifact_directory",
  "pick_artifact_files",
  "startup",
  // Actor writes, after which the profile page reloads itself. A join code
  // only changes the actor once another device approves it.
  "approve_actor_revision",
  "approve_enrollment",
  "cancel_leave",
  "create_actor",
  "join_actor",
  "leave_actor",
  "reject_actor_revision",
  "remove_actor_key",
  "retire_actor",
  "update_actor_profile",
  "withdraw_actor_revision",
  // Writes outside the cache: boards, releases, artifacts, embeds, files and
  // notifications, which their views reload themselves.
  "add_artifact_location",
  "attest_artifact",
  "clear_notifications",
  "create_board",
  "create_or_open_release",
  "delete_release",
  "download_artifact",
  "redact_artifact",
  "register_artifact",
  "remove_artifact_location",
  "remove_artifact_metadata",
  "rename_board",
  "save_diff_to_disk",
  "save_embed_by_bytes",
  "save_embed_by_path",
  "save_embed_to_disk",
  "seed_artifact",
  "set_artifact_metadata",
  "set_board_columns",
  "unseed_artifact",
  "update_board",
];

function backendCommands(): string[] {
  const source = readFileSync(
    join(__dirname, "../../crates/radicle-tauri/src/lib.rs"),
    "utf8",
  );
  const handler = source.match(/generate_handler!\[([\s\S]*?)\]\s*\)/);
  if (!handler) throw new Error("No command handler found");
  return handler[1]
    .replace(/\/\/.*$/gm, "")
    .replace(/#\[[^\]]*\]/g, "")
    .split(",")
    .map(path => path.trim().split("::").pop() ?? "")
    .filter(name => name !== "");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|svelte)$/.test(entry.name) ? [path] : [];
  });
}

// The object literal starting at `start`, which is a `{`.
function objectAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Unbalanced braces");
}

// The names of an object literal's own properties, with nested literals as
// objects of their own.
function shapeOf(literal: string): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  const body = literal.slice(1, -1);
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < body.length; i++) {
    if ("{[(".includes(body[i])) depth++;
    if ("}])".includes(body[i])) depth--;
    if (body[i] === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  for (const part of parts) {
    const match = part.trim().match(/^(\w+)\s*(?::\s*([\s\S]*))?$/);
    if (!match) continue;
    const value = match[2]?.trim();
    shape[match[1]] = value?.startsWith("{")
      ? shapeOf(objectAt(value, 0))
      : "x";
  }
  return shape;
}

// Fills every property with an id, so that only the names matter.
function withIds(shape: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(shape).map(([name, value]) => [
      name,
      typeof value === "object" && value !== null
        ? withIds(value as Record<string, unknown>)
        : "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5",
    ]),
  );
}

// Each call of a mapped write in the app, with the shape of its arguments
// where they are written out in the call or in a variable of the same file.
function writeCalls(): { cmd: string; where: string; args: unknown }[] {
  const calls = [];
  for (const file of sourceFiles(join(__dirname, "../../src"))) {
    const source = readFileSync(file, "utf8");
    const call = /invoke(?:<[^>]*>)?\(\s*"(\w+)"\s*,\s*(\{|\w+)/g;
    for (const match of source.matchAll(call)) {
      const [, cmd, arg] = match;
      if (!mappedWrites.includes(cmd)) continue;
      let literal: string | undefined;
      if (arg === "{") {
        literal = objectAt(source, match.index + match[0].length - 1);
      } else {
        const declared = source.lastIndexOf(`const ${arg} = {`, match.index);
        if (declared >= 0) {
          literal = objectAt(source, source.indexOf("{", declared));
        }
      }
      if (literal === undefined) continue;
      calls.push({
        cmd,
        where: `${file.split("/src/")[1]}`,
        args: withIds(shapeOf(literal)),
      });
    }
  }
  return calls;
}

describe("write commands", () => {
  const commands = backendCommands();

  test("every backend command is classified once", () => {
    const classified = [...mappedWrites, ...outsideCache];
    expect(new Set(classified).size).toBe(classified.length);
    expect(commands.filter(cmd => !classified.includes(cmd))).toEqual([]);
  });

  test("every classified command exists", () => {
    expect(
      [...mappedWrites, ...outsideCache].filter(cmd => !commands.includes(cmd)),
    ).toEqual([]);
  });

  test("every mapped write affects some keys", () => {
    const rid = "rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5";
    const id = "d87dcfe8c2b3200e78b128d9b959cfdf7063fefe";
    const args = { rid, cobId: id, new: { id }, args: { rid } };
    expect(
      mappedWrites.filter(cmd => writtenKeys(cmd, args, { id }).length === 0),
    ).toEqual([]);
  });

  test("every call of a mapped write names what it changes", () => {
    const calls = writeCalls();
    expect(calls.length).toBeGreaterThan(10);
    expect(
      calls
        .filter(
          ({ cmd, args }) => writtenKeys(cmd, args, { id: "x" }).length === 0,
        )
        .map(({ cmd, where }) => `${cmd} in ${where}`),
    ).toEqual([]);
  });
});
