<script lang="ts">
  import type { Commit } from "@bindings/repo/Commit";
  import type { Readme } from "@bindings/repo/Readme";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";
  import type { Blob } from "@bindings/source/Blob";
  import type { Tree } from "@bindings/source/Tree";

  import { toHtml } from "hast-util-to-html";
  import { capitalize } from "lodash";
  import { useOverlayScrollbars } from "overlayscrollbars-svelte";

  import { invoke, InvokeError } from "@app/lib/invoke";
  import * as router from "@app/lib/router";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { highlight } from "@app/lib/syntax";

  import Asciidoc from "@app/components/Asciidoc.svelte";
  import FileBlock from "@app/components/FileBlock.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import Path from "@app/components/Path.svelte";
  import PreviewSwitch from "@app/components/PreviewSwitch.svelte";
  import RepoHeader from "@app/components/RepoHeader.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import SourceHeader from "@app/components/SourceHeader.svelte";
  import TreeComponent from "@app/components/Tree.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  interface Props {
    tree: Tree;
    repo: RepoInfo;
    peer?: string;
    revision?: string;
    oid: string;
    commit: Commit;
    readme: Readme | null;
    path?: string;
    sidebarData: SidebarData;
  }

  /* eslint-disable prefer-const */
  let {
    tree,
    readme,
    repo,
    peer,
    revision,
    oid,
    commit,
    path,
    sidebarData,
  }: Props = $props();
  /* eslint-enable prefer-const */

  const baseRoute = $derived({
    resource: "repo.home" as const,
    rid: repo.rid,
    peer,
    revision,
  });

  let currentPath = $state("");
  let codeElement: HTMLElement | undefined = $state();
  let error: InvokeError | undefined = $state();

  // The file that was last opened, so that reloading the same route doesn't
  // fetch it again, while switching revisions on the same path does.
  let openedFile: string | undefined;

  // The shown file lives in the route, so browsing the tree and following
  // links inside a document both go through history.
  $effect(() => {
    if (!path) {
      openedFile = undefined;
      blob = readme;
      currentPath = readme?.path || "";
      error = undefined;
      return;
    }

    const file = `${repo.rid}:${oid}:${path}`;
    if (file !== openedFile) {
      openedFile = file;
      void openPath(path);
    }
  });

  function showPath(filePath: string | undefined, fragment?: string) {
    void router.push({ ...baseRoute, path: filePath }, fragment);
  }

  function isMarkdownPath(path: string): boolean {
    return /\.(md|mkd|markdown)$/i.test(path);
  }

  function isAsciidocPath(path: string): boolean {
    return /\.(adoc|asciidoc|asc)$/i.test(path);
  }

  async function fetchTree(path: string) {
    return await invoke<Tree>("repo_tree", { rid: repo.rid, path, sha: oid });
  }

  async function fetchBlob(path: string) {
    try {
      blob = await invoke<Blob>("repo_blob", {
        rid: repo.rid,
        path,
        sha: oid,
      });
      currentPath = path;
      error = undefined;
    } catch (err) {
      error =
        err instanceof InvokeError
          ? err
          : new InvokeError(err instanceof Error ? err.message : String(err));
      currentPath = path;
    }
    return;
  }

  async function openPath(path: string) {
    await fetchBlob(path);
    if (!error) return;
    const directory = await fetchTree(path).then(
      () => true,
      () => false,
    );
    if (directory) {
      blob = readme;
      error = undefined;
    }
  }

  $effect(() => {
    if (codeElement) {
      const [initialize] = useOverlayScrollbars({
        options: () => ({
          scrollbars: { theme: "global-os-theme-radicle", autoHide: "scroll" },
        }),
        defer: true,
      });

      initialize({ target: codeElement });
    }
  });

  const previewable = $derived(
    isMarkdownPath(currentPath) || isAsciidocPath(currentPath),
  );
  let preview = $derived(previewable);

  // Parent reuses this component across routes; a sibling $effect resets blob
  // when the readme prop changes, and fetchBlob mutates it during navigation.
  // svelte-ignore state_referenced_locally
  let blob: Blob | Readme | null = $state(readme);
  const showLineNumbers = $derived(
    blob && !blob.binary && blob.content.trim() !== "" && !preview && !error,
  );
</script>

<style>
  .content {
    height: 100%;
  }
  .line-column {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .blob {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 1rem;
    overflow: hidden;
  }
  .blob-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100dvh - 7rem);
  }
  .code,
  .commit-msg {
    -webkit-touch-callout: initial;
    -webkit-user-select: text;
    user-select: text;
    cursor: text;
  }
</style>

<Layout selfScroll>
  <div
    class="content"
    style:display="flex"
    style:flex-direction="column"
    style:height="100%">
    <RepoHeader {repo} config={sidebarData.config} />
    <SourceHeader
      {repo}
      {peer}
      {revision}
      {oid}
      {commit}
      {baseRoute}
      active="files" />
    <div
      style:display="grid"
      style:grid-template-columns="16.5rem 1fr"
      style:grid-template-rows="100%"
      style:flex="1"
      style:min-height="0">
      <div
        style:display="flex"
        style:flex-direction="column"
        style:height="100%"
        style:min-height="0"
        style:overflow="hidden">
        {#if tree.entries.length > 0}
          <ScrollArea
            style="border-right: 1px solid var(--color-border-subtle); flex: 1; min-height: 0; width: 100%; padding: 0.5rem;">
            {#key oid}
              <TreeComponent
                {tree}
                {currentPath}
                {fetchTree}
                onSelect={showPath} />
            {/key}
          </ScrollArea>
        {/if}
      </div>
      <ScrollArea style="height: 100%; min-width: 0;">
        <div class="container">
          <div style:min-width="0">
            {#if blob === null && !error}
              <div
                style:display="flex"
                style:min-height="calc(100dvh - 7rem)"
                style:gap="0.5rem"
                style:align-items="center"
                style:background-color="var(--color-surface-canvas)"
                style:padding="1rem">
                <div
                  class="global-flex txt-missing txt-body-m-regular"
                  style:width="100%"
                  style:justify-content="center">
                  No README.md
                </div>
              </div>
            {:else}
              <FileBlock
                expandable={false}
                sticky={false}
                border={false}
                headerBackground="var(--color-surface-subtle)">
                {#snippet leftHeader()}
                  <div style:margin-left="0.5rem" style:flex-shrink="0">
                    <Path fullPath={currentPath} />
                  </div>
                  {#if blob && !error}
                    <div
                      style:display="flex"
                      style:gap="0.5rem"
                      style:align-items="center"
                      style:min-width="0"
                      style:margin-right="1rem"
                      style:background-color="var(--color-surface-mid)"
                      style:padding="2px 4px"
                      style:border-radius="var(--border-radius-sm)">
                      <Id
                        id={blob.commit.id}
                        clipboard={blob.commit.id}
                        label="commit hash" />
                      <span
                        class="commit-msg txt-overflow"
                        style:min-width="0"
                        style:max-width="20rem">
                        {blob.commit.message}
                      </span>
                    </div>
                  {/if}
                {/snippet}

                {#snippet rightHeader()}
                  {#if previewable && !error}
                    <PreviewSwitch bind:preview />
                  {/if}
                {/snippet}

                <div class="blob">
                  <div class="line-column">
                    {#if blob && showLineNumbers}
                      {#each blob.content
                        .trimEnd()
                        .split("\n")
                        .map((_, index) => index) as line}
                        <div class="txt-missing txt-code-regular">
                          {line + 1}
                        </div>
                      {/each}
                    {/if}
                  </div>
                  <div style:width="100%" bind:this={codeElement}>
                    {#if error || !blob}
                      <div
                        class="txt-body-m-regular blob-placeholder txt-missing">
                        <Icon name="warning" size="32" />
                        {#if error?.code === "PayloadError.TooLarge"}
                          <span>File size exceeds limit of 10 MB.</span>
                        {:else}
                          <span>{capitalize(error?.message)}</span>
                        {/if}
                      </div>
                    {:else if blob.binary}
                      {#if blob.mimeType.startsWith("image")}
                        <img
                          src={`data:${blob.mimeType};base64,${blob.content}`}
                          alt={`Preview of ${blob.id}`} />
                      {:else}
                        <div
                          class="txt-body-m-regular blob-placeholder txt-missing">
                          <span>Binary file</span>
                        </div>
                      {/if}
                    {:else if preview}
                      <div style:margin-top="1rem">
                        {#if isAsciidocPath(currentPath)}
                          <Asciidoc
                            content={blob.content}
                            rid={repo.rid}
                            sha={oid}
                            path={currentPath}
                            onNavigate={showPath} />
                        {:else}
                          <Markdown
                            rid={repo.rid}
                            path={currentPath}
                            sha={oid}
                            content={blob.content}
                            onNavigate={showPath} />
                        {/if}
                      </div>
                    {:else if blob.content.trim() === ""}
                      <div
                        class="txt-body-m-regular blob-placeholder txt-missing">
                        <span>Empty file</span>
                      </div>
                    {:else}
                      <code>
                        <pre
                          class="code txt-code-regular"
                          style:margin="0"
                          style:padding="0">{#await highlight(blob.content, currentPath
                              .split(".")
                              .at(-1) || "raw")}{blob.content}{:then tree}{@html toHtml(
                              tree,
                            )}{/await}</pre>
                      </code>
                    {/if}
                  </div>
                </div>
              </FileBlock>
            {/if}
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</Layout>
