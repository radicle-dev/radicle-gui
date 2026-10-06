import type { Board } from "@bindings/cob/board/Board";

import { get } from "svelte/store";

import { nodeRunning } from "@app/lib/events";
import { invoke } from "@app/lib/invoke";
import { show } from "@app/lib/modal";
import * as router from "@app/lib/router";

import { announce } from "@app/components/AnnounceSwitch.svelte";
import BoardName from "@app/modals/BoardName.svelte";

export const DEFAULT_BOARD_NAME = "Board";

// A repository with one board doesn't show its name, so it's simply "Board".
// Adding a second numbers both: the first becomes "Board 1" unless someone
// already named it, and the new one starts out as the next number.
export async function promptNewBoard(rid: string) {
  const boards = await invoke<Board[]>("list_boards", { rid });
  const opts = () => ({ announce: get(nodeRunning) && get(announce) });

  show({
    component: BoardName,
    props: {
      title: "New board",
      action: "Create",
      name: `${DEFAULT_BOARD_NAME} ${Math.max(boards.length, 1) + 1}`,
      save: async (name: string) => {
        if (boards.length === 0) {
          await invoke<Board>("create_board", {
            rid,
            name: `${DEFAULT_BOARD_NAME} 1`,
            opts: opts(),
          });
        } else if (
          boards.length === 1 &&
          boards[0].name === DEFAULT_BOARD_NAME
        ) {
          await invoke<Board>("rename_board", {
            rid,
            board: boards[0].id,
            name: `${DEFAULT_BOARD_NAME} 1`,
            opts: opts(),
          });
        }
        const created = await invoke<Board>("create_board", {
          rid,
          name,
          opts: opts(),
        });
        await router.push({
          resource: "repo.board",
          rid,
          view: "board",
          board: created.id,
        });
      },
    },
  });
}
