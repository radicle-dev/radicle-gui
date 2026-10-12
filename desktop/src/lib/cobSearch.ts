import type { Author } from "@bindings/cob/Author";

import fuzzysort from "fuzzysort";

interface Searchable {
  id: string;
  title: string;
  labels: string[];
  assignees: Author[];
  author: Author;
}

export function searchCobs<T extends Searchable>(
  query: string,
  cobs: T[],
): T[] {
  const index = cobs.map(cob => ({
    cob,
    id: cob.id,
    title: cob.title,
    labels: cob.labels.join(" "),
    assignees: cob.assignees.map(a => a.alias ?? "").join(" "),
    author: cob.author.alias ?? "",
  }));
  return fuzzysort
    .go(query, index, {
      keys: ["title", "labels", "assignees", "author", "id"],
      threshold: 0.5,
      all: true,
    })
    .map(result => result.obj.cob);
}
