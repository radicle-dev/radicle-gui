import { dynamicInterval } from "@app/lib/interval";
import { invoke } from "@app/lib/invoke";

let lock = false;

let installed = $state(false);

export const radicleInstalled = () => installed;

export async function checkRadicleCLI() {
  try {
    if (lock) {
      return;
    }
    lock = true;
    await invoke<null>("check_radicle_cli");
    dynamicInterval(
      "checkRadicleCLI",
      checkRadicleCLI,
      import.meta.env.VITE_CHECK_RADICLE_LONG_DELAY || 30_000,
    );
    installed = true;
  } catch {
    dynamicInterval("checkRadicleCLI", checkRadicleCLI, 1_000);
    installed = false;
  } finally {
    lock = false;
  }
}
