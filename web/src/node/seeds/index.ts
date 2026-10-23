import type { OrgSeed, PersonSeed, RepoSeed } from "./types";

import { adventOfCode } from "./adventOfCode";
import { atlasUi } from "./atlasUi";
import { audits } from "./audits";
import { beacon } from "./beacon";
import { cropcal } from "./cropcal";
import { dotfiles } from "./dotfiles";
import { fieldNotes } from "./fieldNotes";
import { inkwell } from "./inkwell";
import { keebFirmware } from "./keebFirmware";
import { meshd } from "./meshd";
import { meshmap } from "./meshmap";
import { orgs } from "./orgs";
import { pagecraft } from "./pagecraft";
import { people } from "./people";
import { recipes } from "./recipes";
import { sigil } from "./sigil";
import { soilsense } from "./soilsense";
import { sprout } from "./sprout";
import { tidepool } from "./tidepool";
import { tinyRaft } from "./tinyRaft";

export const seeds: {
  people: PersonSeed[];
  orgs: OrgSeed[];
  repos: RepoSeed[];
} = {
  people,
  orgs,
  repos: [
    beacon,
    atlasUi,
    fieldNotes,
    tidepool,
    sprout,
    dotfiles,
    meshd,
    meshmap,
    inkwell,
    pagecraft,
    sigil,
    audits,
    soilsense,
    cropcal,
    tinyRaft,
    keebFirmware,
    recipes,
    adventOfCode,
  ],
};

// What the user's node starts out seeding and following.
export const initialSeeding = ["beacon", "atlas-ui", "field-notes", "tidepool", "sprout", "sigil", "inkwell"];
export const initialFollowing = ["ada", "mira", "yuki", "tidal-collective"];
