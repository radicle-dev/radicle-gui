import type { ActorProfile } from "@bindings/actor/ActorProfile";
import type { ProfileLink } from "@bindings/actor/ProfileLink";

// The form holds every field as a string, so an empty one reads as unset
// when the profile is sent. A link row has an id of its own, so a removed
// row above it does not take its values and focus.
export interface Form {
  displayName: string;
  fullName: string;
  pronouns: string;
  bio: string;
  location: string;
  timezone: string;
  avatar: string;
  banner: string;
  links: (ProfileLink & { id: number })[];
}

export type TextField = Exclude<keyof Form, "links">;
export const TEXT_FIELDS: TextField[] = [
  "displayName",
  "fullName",
  "pronouns",
  "bio",
  "location",
  "timezone",
  "avatar",
  "banner",
];

// `loaded` with the fields typed into `typed` over it, for a form that
// turned out to edit a profile made elsewhere. A field the user left as
// `empty` keeps the loaded value; so do the links while no link was typed.
export function laidOver(typed: Form, loaded: Form, empty: Form): Form {
  const merged = { ...loaded };
  for (const field of TEXT_FIELDS) {
    if (typed[field] !== empty[field]) merged[field] = typed[field];
  }
  if (typed.links.length > 0) merged.links = typed.links;
  return merged;
}

// What can differ between two versions of the profile, field by field.
export type MergeField = TextField | "links";
export const MERGE_FIELDS: MergeField[] = [...TEXT_FIELDS, "links"];

// A field as the profile file holds it, for comparing two versions.
export function fieldValue(
  profile: ActorProfile | undefined,
  field: MergeField,
): string {
  if (field === "links") {
    return JSON.stringify(
      (profile?.links ?? []).map(({ url, label }) => ({ url, label })),
    );
  }

  return (profile?.[field] ?? "").trim();
}

// A field that differs between this device's version and another's: one
// only the other device changed since the two split is taken from there;
// one both changed is for the user to pick. A field only this device
// changed keeps its value, so it is left out.
export interface FieldDifference {
  field: MergeField;
  changedOn: "theirs" | "both";
}

export function compareVersions(
  mine: ActorProfile | undefined,
  theirs: ActorProfile | undefined,
  base: ActorProfile | undefined,
): FieldDifference[] {
  return MERGE_FIELDS.flatMap(field => {
    const ours = fieldValue(mine, field);
    const other = fieldValue(theirs, field);
    if (ours === other) return [];
    // Without the version both started from, every difference is a choice.
    if (base === undefined) return [{ field, changedOn: "both" as const }];

    const before = fieldValue(base, field);
    if (other === before) return [];
    return [
      { field, changedOn: ours === before ? ("theirs" as const) : "both" },
    ];
  });
}
