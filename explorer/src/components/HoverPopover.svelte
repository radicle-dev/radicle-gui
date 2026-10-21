<script lang="ts">
  import debounce from "lodash/debounce";

  export let stylePopoverPositionBottom: string | undefined = undefined;
  export let stylePopoverPositionLeft: string | undefined = undefined;
  export let stylePopoverPositionTop: string | undefined = undefined;
  export let canMouseOver: boolean = false;

  let visible: boolean = false;

  const setVisible = debounce((value: boolean) => {
    visible = value;
  }, 50);
</script>

<style>
  .container {
    position: relative;
    display: inline-block;
  }
  .popover {
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border-subtle);
    padding: 1rem;
    box-shadow: var(--elevation-low);
    position: absolute;
    z-index: 10;
  }
</style>

<div class="container">
  <div
    role="button"
    tabindex="0"
    on:mouseenter={() => setVisible(true)}
    on:mouseleave={() => setVisible(false)}>
    <slot name="toggle" />

    {#if visible}
      <div style:position="absolute">
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="popover"
          on:mouseenter={() =>
            canMouseOver ? setVisible(true) : setVisible(false)}
          on:mouseleave={() => (canMouseOver ? setVisible(false) : undefined)}
          style:left={stylePopoverPositionLeft}
          style:bottom={stylePopoverPositionBottom}
          style:top={stylePopoverPositionTop}>
          <slot name="popover" />
        </div>
      </div>
    {/if}
  </div>
</div>
