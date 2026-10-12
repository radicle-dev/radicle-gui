import { invoke } from "@app/lib/invoke";

export async function pickFiles(): Promise<string[]> {
  return invoke<string[]>("pick_artifact_files");
}

export async function pickFolder(): Promise<string | undefined> {
  return (await invoke<string | null>("pick_artifact_directory")) ?? undefined;
}

export async function pickLike(
  directory: boolean,
): Promise<string | undefined> {
  return directory ? pickFolder() : (await pickFiles())[0];
}
