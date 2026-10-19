<script lang="ts">
  interface Props {
    content: string;
    highlight?: { start: number; end: number };
  }

  const { content, highlight }: Props = $props();
  const lines = $derived(content.replace(/\n$/, "").split("\n"));
</script>

<style>
  .code {
    overflow-x: auto;
    font: var(--txt-code-regular);
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    padding: 0;
    vertical-align: top;
  }
  .num {
    width: 1%;
    min-width: 3rem;
    padding: 0 0.75rem 0 1rem;
    text-align: right;
    color: var(--color-text-quaternary);
    user-select: none;
    white-space: nowrap;
  }
  .num a {
    color: inherit;
    text-decoration: none;
  }
  .text {
    white-space: pre;
    padding-right: 1rem;
  }
  tr.hl {
    background: color-mix(in srgb, var(--color-feedback-warning-border) 14%, transparent);
  }
  tr:first-child td {
    padding-top: 0.625rem;
  }
  tr:last-child td {
    padding-bottom: 0.625rem;
  }
</style>

<div class="code">
  <table>
    <tbody>
      {#each lines as line, i (i)}
        <tr
          id={`L${i + 1}`}
          class:hl={highlight && i + 1 >= highlight.start && i + 1 <= highlight.end}>
          <td class="num"><a href={`#L${i + 1}`}>{i + 1}</a></td>
          <td class="text">{line}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
