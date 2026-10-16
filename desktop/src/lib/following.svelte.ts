import type { FollowedNode } from "@bindings/cob/FollowedNode";

import { cachedSearchAliases, invoke } from "@app/lib/invoke";
import { publicKeyFromDid } from "@app/lib/utils";

// The nodes this profile follows, shared by every hover card and the settings
// list so that following someone in one place shows everywhere at once.
class Following {
  nodes: FollowedNode[] = $state([]);
  #loading: Promise<void> | undefined;

  #publicKeys = $derived(
    new Set(this.nodes.map(node => publicKeyFromDid(node.did))),
  );

  isFollowed(publicKey: string): boolean {
    return this.#publicKeys.has(publicKey);
  }

  load(): Promise<void> {
    this.#loading ??= this.reload();
    return this.#loading;
  }

  async reload(): Promise<void> {
    try {
      this.nodes = await invoke<FollowedNode[]>("following");
    } catch (error) {
      this.#loading = undefined;
      throw error;
    }
  }

  async follow(publicKey: string): Promise<void> {
    await invoke("follow", { nid: publicKey });
    cachedSearchAliases.clear();
    await this.reload();
  }

  async unfollow(publicKey: string): Promise<void> {
    await invoke("unfollow", { nid: publicKey });
    cachedSearchAliases.clear();
    await this.reload();
  }
}

export const following = new Following();
