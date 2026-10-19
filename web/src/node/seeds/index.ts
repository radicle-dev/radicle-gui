import type { OrgSeed, PersonSeed, RepoSeed } from "./types";

import { atlasUi } from "./atlasUi";
import { beacon } from "./beacon";
import { dotfiles } from "./dotfiles";
import { fieldNotes } from "./fieldNotes";
import { orgs } from "./orgs";
import { people } from "./people";
import { sprout } from "./sprout";
import { tidepool } from "./tidepool";

export const seeds: {
  people: PersonSeed[];
  orgs: OrgSeed[];
  repos: RepoSeed[];
} = {
  people,
  orgs,
  repos: [beacon, atlasUi, fieldNotes, tidepool, sprout, dotfiles],
};

// What the user's node starts out seeding and following.
export const initialSeeding = ["beacon", "atlas-ui", "field-notes", "tidepool", "sprout"];
export const initialFollowing = ["ada", "mira", "yuki", "tidal-collective"];
