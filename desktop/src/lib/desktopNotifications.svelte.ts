import type { Action } from "./notification";
import type { Author } from "@bindings/cob/Author";
import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";
import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import * as z from "zod";

import { invoke } from "./invoke";
import { compressActions } from "./notification";
import useLocalStorage from "./useLocalStorage.svelte";
import { truncateDid } from "./utils";

// How many notifications to deliver at once before collapsing the rest into a
// single summary, so a large sync doesn't bury the notification centre.
const MAX_INDIVIDUAL = 5;

const isEnabledStore = useLocalStorage(
  "desktopNotifications.isEnabled",
  z.boolean(),
  true,
  !window.localStorage,
);

// Timestamp of the newest inbox item already delivered to the OS. Items at or
// below the watermark are never re-delivered, so restarting the app doesn't
// replay the whole inbox.
const watermarkStore = useLocalStorage(
  "desktopNotifications.watermark",
  z.number(),
  0,
  !window.localStorage,
);

function isSupported(): boolean {
  return Boolean(window.__TAURI_INTERNALS__);
}

/** A single inbox group turned into deliverable notification text. */
interface Delivery {
  timestamp: number;
  title: string;
  body: string;
}

function authorLabel(author: Author): string {
  return author.alias ? author.alias : truncateDid(author.did);
}

// `createSummary` marks IDs with a `txt-id` span for the in-app teaser. The OS
// notification body is plain text, so unwrap them.
function toPlainText(summary: string): string {
  return summary.replace(/<[^>]*>/g, "");
}

// Longest comment excerpt to show. macOS truncates the body itself, but
// trimming here keeps the notification from carrying a whole essay.
const MAX_COMMENT_CHARS = 140;

/**
 * The text of the most recent comment in a group, if it contains one.
 *
 * Issue comments and a patch's review and revision comments all carry their
 * message in `body`, so one lookup covers every kind.
 */
function commentText(actions: Action[]): string | undefined {
  for (const action of [...actions].reverse()) {
    if ("body" in action && typeof action.body === "string") {
      const flattened = action.body.replace(/\s+/g, " ").trim();
      if (flattened) {
        return flattened.length > MAX_COMMENT_CHARS
          ? `${flattened.slice(0, MAX_COMMENT_CHARS - 1)}…`
          : flattened;
      }
    }
  }

  return undefined;
}

/**
 * Turn one inbox group (all notifications for a single issue or patch) into
 * the text of a single OS notification, mirroring how `NotificationTeaser`
 * renders it in the inbox.
 */
function toDelivery(
  repo: NotificationsByRepo,
  group: NotificationItem[],
): Delivery | undefined {
  const last = group.at(-1);
  if (!last) {
    return undefined;
  }

  const actions = compressActions(
    group
      .flatMap<Action>(item => item.actions)
      .sort((a, b) => a.timestamp - b.timestamp),
    last.type,
    last.id,
  );

  // Show what was said, not just that something was said. The summary line is
  // kept above it so non-comment actions and comment counts still read as they
  // do in the inbox.
  const lines = actions.flatMap(action => {
    const summary = `${authorLabel(action.items[0].author)} ${toPlainText(action.summary)}`;
    const text = commentText(action.items);

    return text ? [summary, text] : [summary];
  });

  return {
    timestamp: Math.max(...group.map(item => item.timestamp)),
    title: `${repo.name} · ${last.title}`,
    body: lines.join("\n"),
  };
}

let delivering = false;

/**
 * Fetch the inbox and deliver an OS notification for every issue or patch that
 * has picked up activity since the last delivery.
 *
 * Called from the inbox count poll, and only when the count has grown, so the
 * comparatively expensive `list_notifications` call stays rare.
 */
export async function deliverNewNotifications(): Promise<void> {
  if (!isSupported() || !isEnabledStore.value) {
    return;
  }

  // The inbox poll doesn't await its callback, so a slow `list_notifications`
  // can overlap the next tick. Both runs would read the same watermark and
  // deliver the same items twice, so let only one run at a time.
  if (delivering) {
    return;
  }
  delivering = true;
  try {
    await deliver();
  } finally {
    delivering = false;
  }
}

async function deliver(): Promise<void> {
  // On the very first run there is no watermark, so treat everything already
  // in the inbox as seen instead of replaying it.
  if (watermarkStore.value === 0) {
    watermarkStore.value = Date.now();
    return;
  }

  if (!(await isPermissionGranted())) {
    const permission = await requestPermission();
    if (permission !== "granted") {
      // Don't ask again this session; the OS remembers a denial anyway.
      isEnabledStore.value = false;
      return;
    }
  }

  const repos = await invoke<NotificationsByRepo[]>("list_notifications", {
    params: { take: 100 },
  });

  const watermark = watermarkStore.value;
  const deliveries = repos
    .flatMap(repo => repo.notifications.map(group => toDelivery(repo, group)))
    .filter((d): d is Delivery => d !== undefined && d.timestamp > watermark)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (deliveries.length === 0) {
    return;
  }

  if (deliveries.length > MAX_INDIVIDUAL) {
    sendNotification({
      title: "Radicle",
      body: `${deliveries.length} new notifications in your inbox`,
    });
  } else {
    for (const delivery of deliveries) {
      sendNotification({ title: delivery.title, body: delivery.body });
    }
  }

  // Advance the watermark only once the notifications have actually been
  // handed to the OS. Advancing first would consume the items even if the
  // send failed, and they would never be delivered.
  watermarkStore.value = Math.max(...deliveries.map(d => d.timestamp));
}

export const desktopNotifications = {
  get isEnabled() {
    return isEnabledStore.value;
  },
  enable() {
    isEnabledStore.value = true;
    // Adopt the current moment as the watermark so enabling the setting
    // doesn't immediately replay the existing inbox.
    watermarkStore.value = Date.now();
  },
  disable() {
    isEnabledStore.value = false;
  },
};
