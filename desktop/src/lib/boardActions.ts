import type { Board } from "@bindings/cob/board/Board";

import { get } from "svelte/store";

import { nodeRunning } from "@app/lib/events";
import { invoke } from "@app/lib/invoke";
import { show } from "@app/lib/modal";
import * as router from "@app/lib/router";

import { announce } from "@app/components/AnnounceSwitch.svelte";
import CreateBoard from "@app/modals/CreateBoard.svelte";

export const DEFAULT_BOARD_NAME = "Board";

// A board is only ever created on request, and after confirmation. The
// first board is simply "Board"; later ones are numbered from the count.
export async function promptNewBoard(rid: string, repoName: string) {
  const boards = await invoke<Board[]>("list_boards", { rid });
  const opts = () => ({ announce: get(nodeRunning) && get(announce) });

  show({
    component: CreateBoard,
    props: {
      title: boards.length === 0 ? "Create board" : "New board",
      repoName,
      name:
        boards.length === 0
          ? DEFAULT_BOARD_NAME
          : `${DEFAULT_BOARD_NAME} ${boards.length + 1}`,
      confirm: async (name: string) => {
        const created = await invoke<Board>("create_board", {
          rid,
          name,
          opts: opts(),
        });
        await router.push({
          resource: "repo.board",
          rid,
          board: created.id,
        });
      },
    },
  });
}
