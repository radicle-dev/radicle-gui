import type { RepoSummary } from "@bindings/repo/RepoSummary";

// The repositories to show as projects: with the actor lab on, an actor
// repository is a profile and is never listed as one.
export function projectsOf(
  repos: RepoSummary[],
  actorLab: boolean,
): RepoSummary[] {
  return actorLab ? repos.filter(repo => !repo.actor) : repos;
}
