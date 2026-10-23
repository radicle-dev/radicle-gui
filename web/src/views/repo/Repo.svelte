<script lang="ts">
  import type { RepoView } from "@app/lib/router.svelte";

  import { copy } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";
  import { setSeed } from "@app/lib/actions";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import Tabs from "@app/components/Tabs.svelte";

  import Code from "./Code.svelte";
  import CommitView from "./Commit.svelte";
  import Commits from "./Commits.svelte";
  import IssueView from "./Issue.svelte";
  import Board from "./Board.svelte";
  import Issues from "./Issues.svelte";
  import NewIssue from "./NewIssue.svelte";
  import PatchView from "./Patch.svelte";
  import Patches from "./Patches.svelte";
  import Releases from "./Releases.svelte";
  import Identity from "./Identity.svelte";
  import Ryph from "./Ryph.svelte";
  import RepoSettings from "./Settings.svelte";
  import IdentityEdit from "@app/components/IdentityEdit.svelte";

  interface Props {
    owner: string;
    name: string;
    view: RepoView;
  }

  const { owner, name, view }: Props = $props();

  const repo = $derived(node.repoByPath(owner, name));
  const base = $derived(repo ? node.repoPath(repo) : "");
  const seeding = $derived(repo ? node.seeding[repo.rid] : false);
  const orgId = $derived(repo?.owner.type === "org" ? repo.owner.id : undefined);
  const ownerHref = $derived(
    repo
      ? repo.owner.type === "org"
        ? `/${node.org(repo.owner.id)?.handle}`
        : `/@${node.person(repo.owner.id).alias}`
      : "/",
  );
  const ownerLabel = $derived(repo ? node.ownerHandle(repo.owner) : owner);
  const gitUrl = $derived(
    repo ? `https://ash.seeds.rad/${repo.rid.replace("rad:", "")}.git` : "",
  );
  const ryph = $derived(repo ? node.ryphFor(repo) : undefined);

  const tab = $derived(view.tab);
  const tabs = $derived(
    repo
      ? [
          { label: "Code", href: base, icon: "code" as const, active: tab === "code" },
          {
            label: "Issues",
            href: `${base}/issues`,
            icon: "issue" as const,
            active: tab === "issues" || tab === "issue" || tab === "newIssue",
            count: repo.issues.filter(i => i.state === "open").length,
          },
          {
            label: "Patches",
            href: `${base}/patches`,
            icon: "patch" as const,
            active: tab === "patches" || tab === "patch",
            count: repo.patches.filter(p => p.state === "open").length,
          },
          {
            label: "Board",
            href: `${base}/board`,
            icon: "dashboard" as const,
            active: tab === "board",
          },
          {
            label: "Commits",
            href: `${base}/commits`,
            icon: "commit" as const,
            active: tab === "commits" || tab === "commit",
          },
          {
            label: "Releases",
            href: `${base}/releases`,
            icon: "parcel" as const,
            active: tab === "releases",
            count: repo.releases.length,
          },
          {
            label: "Identity",
            href: `${base}/identity`,
            icon: "key" as const,
            active: tab === "identity",
            count: node.pendingIdentity(repo).length || undefined,
          },
          ...(ryph || tab === "ryph"
            ? [
                {
                  label: "Ryph",
                  href: `${base}/ryph`,
                  icon: "lightbulb" as const,
                  active: tab === "ryph",
                  count: ryph ? node.ryphRuns(repo).filter(r => !r.finished).length || undefined : undefined,
                },
              ]
            : []),
          ...(node.isDelegate(repo)
            ? [{ label: "Settings", href: `${base}/settings`, icon: "settings" as const, active: tab === "settings" }]
            : []),
        ]
      : [],
  );
</script>

<style>
  .header {
    padding: 1.75rem 0 0;
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface-base);
  }
  .inner {
    max-width: 76rem;
    margin: 0 auto;
    padding: 0 1.5rem;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }
  .repo-avatar {
    border-radius: var(--border-radius-sm);
    overflow: hidden;
    display: flex;
  }
  h1 {
    font: var(--txt-heading-l);
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  h1 .owner {
    color: var(--color-text-secondary);
    font-weight: 468;
    text-decoration: none;
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
  }
  h1 .owner:hover {
    color: var(--color-text-primary);
  }
  h1 .sep {
    color: var(--color-text-quaternary);
    font-weight: 400;
  }
  .vis {
    font: var(--txt-body-s-medium);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-full);
    /* The same space on every side of the icons. */
    padding: 0.1875rem 0.5rem 0.1875rem 0.1875rem;
    /* Centres the badge on the name's x-height rather than its line box. */
    position: relative;
    top: 0.125rem;
    color: var(--color-text-tertiary);
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
  .desc {
    color: var(--color-text-secondary);
    font: var(--txt-body-m-regular);
    margin: 0;
  }
  .desc-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 1.5rem;
    margin-bottom: 1rem;
  }
  .desc-edit {
    visibility: hidden;
  }
  .desc-row:is(:hover, :focus-within) .desc-edit {
    visibility: visible;
  }
  .clone {
    width: 26rem;
    padding: 1rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .clone .cmd {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0.375rem 0.25rem 0.375rem 0.625rem;
  }
  .clone .cmd span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seed-count {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    border-left: 1px solid var(--color-border-mid);
    padding-left: 0.5rem;
    margin-left: 0.25rem;
  }
  @media (max-width: 600px) {
    .actions {
      margin-left: 0;
      flex-wrap: wrap;
    }
  }
</style>

{#if !repo}
  <div class="page">
    <Empty icon="repository" title="Repository not found on your node">
      <span>
        {owner}/{name} isn't stored on your node, and none of your peers have it right now.
      </span>
    </Empty>
  </div>
{:else}
  <div class="header">
    <div class="inner">
      <div class="title-row">
        <span class="repo-avatar">
          <RepoAvatar name={repo.name} rid={repo.rid} styleWidth="2.25rem" />
        </span>
        <h1>
          <a class="owner" href={ownerHref}>
            {#if orgId}
              <Avatar org={orgId} size="1.25rem" />
            {:else if repo.owner.type === "person"}
              <Avatar person={repo.owner.id} size="1.25rem" />
            {/if}
            {ownerLabel}
          </a>
          <span class="sep">/</span>
          <a class="link" href={base}>{repo.name}</a>
        </h1>
        {#snippet visibilityLabel()}
          {#if repo.visibility === "private"}<Icon name="lock" /> Private{:else}<Icon name="globe" /> Public{/if}
        {/snippet}
        <span class="vis">{@render visibilityLabel()}</span>
        <div class="actions">
          <Button
            variant={seeding ? "ghost" : "outline"}
            bordered={!seeding}
            title={seeding
              ? "Your node stores this repository and serves it to peers"
              : "Store this repository on your node and help serve it"}
            onclick={() => setSeed(repo, !seeding)}>
            <Icon name={seeding ? "seed-filled" : "seed"} />
            {seeding ? "Seeding" : "Seed"}
            <span class="seed-count">{repo.seedCount}</span>
          </Button>
          <Popover placement="bottom-end">
            {#snippet toggle(onclick)}
              <Button variant="secondary" {onclick}>
                <Icon name="checkout" /> Clone <Icon name="chevron-down" />
              </Button>
            {/snippet}
            {#snippet popover()}
              <div class="clone">
                <div class="field">
                  <span class="label">With the Radicle CLI</span>
                  <div class="cmd">
                    <span>rad clone {repo.rid}</span>
                    <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(`rad clone ${repo.rid}`, "clone command")}>
                      <Icon name="copy" />
                    </Button>
                  </div>
                </div>
                <div class="field">
                  <span class="label">With git, from a seed node</span>
                  <div class="cmd">
                    <span>git clone {gitUrl}</span>
                    <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(`git clone ${gitUrl}`, "clone command")}>
                      <Icon name="copy" />
                    </Button>
                  </div>
                </div>
                <span class="muted txt-body-s-regular">
                  Repository ID <span class="mono">{repo.rid}</span>
                </span>
              </div>
            {/snippet}
          </Popover>
        </div>
      </div>
      <div class="desc-row">
        <p class="desc">{repo.description}</p>
        {#if node.isDelegate(repo)}
          <span class="desc-edit">
            <IdentityEdit {repo} kind="setDescription">
              {#snippet trigger(toggle)}
                <Button variant="naked" styleHeight="1.5rem" title="Edit description" ariaLabel="Edit description" onclick={toggle}>
                  <Icon name="edit" />
                </Button>
              {/snippet}
            </IdentityEdit>
          </span>
        {/if}
      </div>
      <Tabs {tabs} />
    </div>
  </div>

  <div class="page">
    {#if view.tab === "code"}
      <Code {repo} rest={view.path} peer={view.peer} />
    {:else if view.tab === "commits"}
      <Commits {repo} />
    {:else if view.tab === "commit"}
      <CommitView {repo} sha={view.sha} />
    {:else if view.tab === "issues"}
      <Issues {repo} filter={view.filter} peek={view.peek} />
    {:else if view.tab === "newIssue"}
      <NewIssue {repo} />
    {:else if view.tab === "issue"}
      <IssueView {repo} id={view.id} />
    {:else if view.tab === "patches"}
      <Patches {repo} filter={view.filter} peek={view.peek} />
    {:else if view.tab === "patch"}
      <PatchView {repo} id={view.id} view={view.view} rev={view.rev} />
    {:else if view.tab === "board"}
      <Board {repo} issue={view.issue} patch={view.patch} />
    {:else if view.tab === "releases"}
      <Releases {repo} />
    {:else if view.tab === "ryph"}
      <Ryph {repo} />
    {:else if view.tab === "identity"}
      <Identity {repo} />
    {:else if view.tab === "settings"}
      <RepoSettings {repo} />
    {/if}
  </div>
{/if}
