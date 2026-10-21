# Open Graph

Worker on `open-graph.radicle.network` that serves OG meta tags and
preview card images for social media embeds.

## How it works

`radicle.network` is a plain static SPA. A Cloudflare Redirect Rule
302s social media crawlers to `open-graph.radicle.network`, which
returns HTML with OG tags. The `og:image` points to `/cards/...` on
the same domain, where the worker renders PNG cards via Satori + resvg-wasm.

Browsers and search crawlers hit the SPA directly — no worker cost.

## Routes

- `/*` — OG HTML with meta tags (cached 2 hours)
- `/cards/*` — PNG card images (cached 2 hours)

Card routes mirror app routes: `/cards/nodes/:host/:rid`,
`/cards/nodes/:host/:rid/issues/:id`, etc. When API fetches fail,
cards degrade: specific item -> repo -> node -> home.

## Cloudflare Redirect Rule

**Rules > Redirect Rules** on the `radicle.dev` zone:

```
(http.host eq "radicle.network") and (
  (http.user_agent contains "Twitterbot") or
  (http.user_agent contains "facebookexternalhit") or
  (http.user_agent contains "Facebot") or
  (http.user_agent contains "LinkedInBot") or
  (http.user_agent contains "Slackbot") or
  (http.user_agent contains "Discordbot") or
  (http.user_agent contains "TelegramBot") or
  (http.user_agent contains "WhatsApp") or
  (http.user_agent contains "Pinterestbot") or
  (http.user_agent contains "ZulipURLPreview") or
  (http.user_agent contains "Bluesky Cardyb") or
  (http.user_agent contains "Mastodon")
)
```

Dynamic 302 to `concat("https://open-graph.radicle.network", http.request.uri.path)`

## Rate Limiting

**Security > WAF > Rate limiting rules** on the `radicle.network` zone:

Verified bots are rate limited to 50 requests per 10 seconds across
all of `radicle.network`, with a 1 minute block.

## Deploy

```sh
npm run deploy:open-graph   # worker
npm run start:open-graph    # local dev
```
