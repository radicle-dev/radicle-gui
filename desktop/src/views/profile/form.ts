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
