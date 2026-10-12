import { invoke } from "@app/lib/invoke";

export const notificationCount = $state({ value: 0 });

export async function refreshNotificationCount() {
  notificationCount.value = await invoke<number>("notification_count");
}

export function badgeCount(
  count: number,
  enabled: boolean,
): number | undefined {
  return enabled && count > 0 ? count : undefined;
}
