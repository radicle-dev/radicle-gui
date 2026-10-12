import type { Entity } from "@app/lib/mentions";
import {
  describeLink,
  parseBareIdentifier,
  parseEntityHref,
} from "@app/lib/mentions";
import type { RadReference } from "@app/lib/radUri";
import {
  isOid,
  parseExplorerTreeUrl,
  parseExplorerUrl,
  parseReference,
} from "@app/lib/radUri";

export type MentionScope = "all" | "cobs";

export type MentionTrigger =
  | {
      kind: "query";
      scope: MentionScope;
      start: number;
      end: number;
      query: string;
    }
  | {
      kind: "identifier";
      start: number;
      end: number;
      target: Entity;
    }
  | {
      kind: "oid";
      start: number;
      end: number;
      oid: string;
    }
  | {
      kind: "link";
      start: number;
      end: number;
      reference: RadReference;
    }
  | {
      kind: "tree";
      start: number;
      end: number;
      rid: string;
      namespace?: string;
      path: string;
      fragment?: string;
    };

const openingCharacters = new Set([" ", "\n", "\t", "(", "[", ">", '"', "'"]);

const queryPattern = /^[\w.-]*$/;

const maximumQueryLength = 64;

const identifierPrefixes = ["did:key:", "rad:", "https://", "http://"];

const maximumIdentifierLength = 512;

export function findMentionTrigger(
  text: string,
  caret: number,
): MentionTrigger | undefined {
  return (
    findQueryTrigger(text, caret) ??
    findIdentifierTrigger(text, caret) ??
    findBareTrigger(text, caret)
  );
}

function findBareTrigger(
  text: string,
  caret: number,
): MentionTrigger | undefined {
  let start = caret;
  while (start > 0 && /[0-9A-Za-z]/.test(text[start - 1])) {
    start--;
  }
  const token = text.slice(start, caret);
  if (token === "") return undefined;
  if (start > 0 && !openingCharacters.has(text[start - 1])) return undefined;

  if (isOid(token)) {
    return { kind: "oid", start, end: caret, oid: token.toLowerCase() };
  }

  const target = parseBareIdentifier(token);

  return target ? { kind: "identifier", start, end: caret, target } : undefined;
}

function findQueryTrigger(
  text: string,
  caret: number,
): MentionTrigger | undefined {
  for (let index = caret - 1; index >= 0; index--) {
    const character = text[index];

    if (character === "@" || character === "#") {
      const preceding = index === 0 ? " " : text[index - 1];
      if (!openingCharacters.has(preceding)) return undefined;

      const query = text.slice(index + 1, caret);
      if (!queryPattern.test(query)) return undefined;

      const scope: MentionScope = character === "@" ? "all" : "cobs";

      return { kind: "query", scope, start: index, end: caret, query };
    }

    if (!queryPattern.test(character)) return undefined;
    if (caret - index > maximumQueryLength) return undefined;
  }

  return undefined;
}

function findIdentifierTrigger(
  text: string,
  caret: number,
): MentionTrigger | undefined {
  let wordStart = caret;
  while (
    wordStart > 0 &&
    !/\s/.test(text[wordStart - 1]) &&
    caret - wordStart < maximumIdentifierLength
  ) {
    wordStart--;
  }
  const word = text.slice(wordStart, caret);
  if (word === "") return undefined;

  const candidates = identifierPrefixes
    .map(prefix => ({ prefix, offset: word.indexOf(prefix) }))
    .filter(({ offset }) => offset !== -1)
    .sort((a, b) => a.offset - b.offset);

  for (const { prefix, offset } of candidates) {
    const trigger = triggerFor(prefix, word.slice(offset));
    if (trigger) return { ...trigger, start: wordStart + offset, end: caret };
  }

  return undefined;
}

type Found = DistributiveOmit<MentionTrigger, "start" | "end">;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

function triggerFor(prefix: string, text: string): Found | undefined {
  const target = parseEntityHref(text);
  if (target) return { kind: "identifier", target };

  const reference =
    prefix === "rad:" ? parseReference(text) : parseExplorerUrl(text);
  if (reference && describeLink(reference, "") !== undefined) {
    return { kind: "link", reference };
  }
  if (prefix === "rad:") return undefined;

  const tree = parseExplorerTreeUrl(text);
  return (
    tree && {
      kind: "tree",
      rid: `rad:${tree.repo}`,
      namespace: tree.namespace,
      path: tree.path,
      fragment: tree.fragment,
    }
  );
}
