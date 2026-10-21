<script lang="ts">
  export let href: string;
  export let title: string;
  export let description: string = "";
  export let image: string = "";
  export let external: boolean = false;
  export let video: boolean = false;
</script>

<style>
  .howto-row {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 2rem;
    padding: 1.25rem 0;
  }

  .howto-thumb {
    display: block;
    position: relative;
    border-radius: var(--border-radius-small);
    overflow: hidden;
  }

  .howto-play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding-left: 0.15rem;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--color-neutrals-opaque-dark-0) 60%,
      transparent
    );
    color: var(--color-neutrals-opaque-light-0);
  }

  .howto-thumb img,
  .howto-thumb-placeholder {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    background: var(--color-surface-subtle);
  }

  .howto-body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .howto-title {
    color: var(--color-text-primary);
    text-decoration: none;
    margin-bottom: 0.5rem;
  }

  /* Stretch the title link across the whole row so the entire block is
     clickable, while keeping a single real link for accessibility. */
  .howto-title::after {
    content: "";
    position: absolute;
    inset: 0;
  }

  .howto-row:hover .link-arrow-right {
    transform: translateX(0.15rem);
  }

  .howto-row:hover .link-arrow-up-right {
    transform: translate(0.15rem, -0.15rem);
  }

  .howto-description {
    margin: 0;
    color: var(--color-text-tertiary);
  }

  @media (max-width: 56rem) {
    .howto-row {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }
</style>

<li class="howto-row">
  <div class="howto-thumb" aria-hidden="true">
    {#if image}
      <img src={image} alt="" />
    {:else}
      <span class="howto-thumb-placeholder" aria-hidden="true"></span>
    {/if}
    {#if video}
      <span class="howto-play" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    {/if}
  </div>
  <div class="howto-body">
    <a
      {href}
      class="howto-title txt-bold-18 arrow-link"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}>
      {title}
      {#if external}
        <span class="link-arrow link-arrow-up-right">↗</span>
      {:else}
        <span class="link-arrow link-arrow-right">→</span>
      {/if}
    </a>
    {#if description}
      <p class="howto-description txt-medium-14">{description}</p>
    {/if}
  </div>
</li>
