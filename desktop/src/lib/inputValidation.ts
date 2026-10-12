import { parseNodeId } from "@app/lib/utils";

export type AliasError =
  | "AliasError.EmptyAlias"
  | "AliasError.TooLongAlias"
  | "AliasError.InvalidAlias";

export function aliasErrors(alias: string): AliasError[] {
  const errors: AliasError[] = [];
  if (alias.length === 0) errors.push("AliasError.EmptyAlias");
  if (alias.length > 32) errors.push("AliasError.TooLongAlias");
  if (alias.includes(" ")) errors.push("AliasError.InvalidAlias");
  return errors;
}

export function labelError(
  label: string,
  labels: string[],
): string | undefined {
  if (labels.includes(label.trim())) {
    return "This label is already assigned";
  }
}

export function parseAssignee(
  input: string,
  assignees: { did: string }[],
): { did?: string; error?: string } {
  input = input.trim();
  if (input === "") return {};
  const nodeId = parseNodeId(input);
  if (!nodeId) {
    return input.startsWith("did:") ? { error: "This is not a valid DID" } : {};
  }
  const did = `${nodeId.prefix}${nodeId.pubkey}`;
  if (assignees.some(assignee => assignee.did === did)) {
    return { error: "This assignee is already added" };
  }
  return { did };
}
