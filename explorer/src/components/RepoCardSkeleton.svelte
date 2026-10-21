<script lang="ts"></script>

<style>
  .repo-card {
    container-type: inline-size;
    height: 10rem;
    background-color: var(--color-surface-canvas);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid var(--color-border-subtle);
    margin-top: -1px;
    margin-left: -1px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .shimmer {
    background: linear-gradient(
      90deg,
      var(--color-surface-mid) 0%,
      var(--color-surface-strong) 50%,
      var(--color-surface-mid) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
    border-radius: var(--border-radius-sm);
  }

  .avatar {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .title {
    height: 1rem;
    width: 40%;
  }

  .description {
    height: 0.875rem;
    width: 80%;
  }

  .rid {
    height: 0.875rem;
    width: 50%;
  }

  .stats-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .stat {
    height: 1rem;
    width: 2.5rem;
  }

  .updated {
    height: 0.875rem;
    width: 6rem;
    margin-left: auto;
  }

  .content-and-activity {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .activity {
    flex: 1;
    max-width: 9rem;
    height: 2rem;
    align-self: flex-end;
  }

  @container (max-width: 22rem) {
    .activity {
      display: none;
    }
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer {
      animation: none;
    }
  }
</style>

<div class="repo-card">
  <div class="row">
    <div class="shimmer avatar"></div>
    <div class="shimmer title"></div>
  </div>
  <div class="content-and-activity">
    <div class="content">
      <div class="shimmer description"></div>
      <div class="shimmer rid"></div>
    </div>
    <div class="shimmer activity"></div>
  </div>
  <div class="stats-row">
    <div class="shimmer stat"></div>
    <div class="shimmer stat"></div>
    <div class="shimmer stat"></div>
    <div class="shimmer updated"></div>
  </div>
</div>
