import type { Config } from "@bindings/config/Config";
import type { SeedingPolicy } from "@bindings/repo/SeedingPolicy";
import type { SeedingScope } from "@bindings/repo/SeedingScope";

// The node's default policy and a repository's own policy are separate types
// with the same two states. Both are reduced to this so they can be described
// with the same vocabulary.
export type ResolvedPolicy =
  { allowed: true; scope: SeedingScope } | { allowed: false };

// The policy that applies to any repository without one of its own.
export function nodePolicy(config: Config): ResolvedPolicy {
  const policy = config.seedingPolicy;

  return policy.default === "allow"
    ? { allowed: true, scope: policy.scope }
    : { allowed: false };
}

export function repoPolicy(policy: SeedingPolicy): ResolvedPolicy {
  return policy.type === "allow"
    ? { allowed: true, scope: policy.scope }
    : { allowed: false };
}

// Whose work the node fetches for a repository it seeds, as a prose fragment
// that completes "from ...".
export function scopeClause(scope: SeedingScope): string {
  return scope === "all"
    ? "all contributors"
    : "delegates and people you follow";
}

// The scopes offered as a choice, in the order they are listed.
export const SEEDING_SCOPES: SeedingScope[] = ["all", "followed"];

export function scopeLabel(scope: SeedingScope): string {
  return `From ${scopeClause(scope)}`;
}

// The scope in force, or undefined when the repository isn't seeded at all.
export function currentScope(policy: SeedingPolicy): SeedingScope | undefined {
  const resolved = repoPolicy(policy);

  return resolved.allowed ? resolved.scope : undefined;
}
