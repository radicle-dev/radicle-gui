import type { Page } from "@playwright/test";
import type { RadiclePeer } from "@tests/support/peerManager.js";

// Calls a backend command directly, to set up or read back state that the UI
// test doesn't go through.
export function api(
  page: Page,
  peer: RadiclePeer,
  command: string,
  data: object,
) {
  return page.request
    .post(`http://127.0.0.1:${peer.httpdBaseUrl.port}/${command}`, { data })
    .then(response => response.json());
}

export async function saveEmbed(
  page: Page,
  peer: RadiclePeer,
  rid: string,
  name: string,
  bytes: Uint8Array,
) {
  const response = await page.request.post(
    `http://127.0.0.1:${peer.httpdBaseUrl.port}/save_embed_by_bytes`,
    {
      headers: { rid, "Content-Type": "application/octet-stream" },
      data: Buffer.concat([Buffer.from(`${name}\0`), bytes]),
    },
  );
  return (await response.json()) as string;
}
