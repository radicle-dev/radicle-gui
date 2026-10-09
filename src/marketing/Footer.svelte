<script lang="ts">
  import { link } from "@app/marketing/link";
</script>

<style>
  .footer {
    display: flex;
    flex-direction: column;
    padding: 6rem var(--marketing-inline-gap) 1rem;
    gap: 6rem;
    margin-top: auto;
    background: var(--color-surface-base);
  }

  .footer-links {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 2rem;
  }

  .link-column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
  }

  .column-header {
    color: var(--color-text-tertiary);
  }

  .link-column a {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .link-column a:hover {
    color: var(--color-text-secondary);
  }

  .footer-bottom {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }

  .copyright {
    color: var(--color-text-tertiary);
  }

  @media (max-width: 64rem) {
    .footer {
      padding: 2rem var(--marketing-inline-gap) 1.5rem;
      gap: 2.5rem;
    }

    .footer-links {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }

    .footer-bottom {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

<footer class="footer">
  <div class="footer-links">
    <div class="link-column">
      <span class="column-header txt-medium-14">Learn</span>
      <a
        href="https://radicle.dev/guides/quick-start/"
        class="txt-medium-14"
        target="_blank"
        rel="noopener noreferrer">
        Get started
      </a>
      <a href="/learn#guides" class="txt-medium-14" use:link>Guides</a>
      <a href="/glossary" class="txt-medium-14" use:link>Glossary</a>
    </div>

    <div class="link-column">
      <span class="column-header txt-medium-14">Social</span>
      <a
        href="https://bsky.app/profile/radicle.xyz"
        target="_blank"
        rel="noopener noreferrer"
        class="txt-medium-14 arrow-link">
        Bluesky <span class="link-arrow link-arrow-up-right">↗</span>
      </a>
      <a
        href="https://twitter.com/radicle"
        target="_blank"
        rel="noopener noreferrer"
        class="txt-medium-14 arrow-link">
        Twitter <span class="link-arrow link-arrow-up-right">↗</span>
      </a>
      <a
        href="https://toot.radicle.dev/@radicle"
        target="_blank"
        rel="noopener noreferrer"
        class="txt-medium-14 arrow-link">
        Mastodon <span class="link-arrow link-arrow-up-right">↗</span>
      </a>
      <a
        href="https://radicle.zulipchat.com"
        target="_blank"
        rel="noopener noreferrer"
        class="txt-medium-14 arrow-link">
        Zulip <span class="link-arrow link-arrow-up-right">↗</span>
      </a>
    </div>
  </div>

  <div class="footer-bottom">
    <span class="copyright txt-medium-14">© 2026 The Radicle Team</span>
  </div>
</footer>
