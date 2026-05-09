# Rêvesvoir

A reflective-writing web app: a sequence of timed exercises followed by an AI-generated synthesis. The name fuses *rêves* (dreams), "voir" (to see), and *réservoir* — a place where the things your unconscious already knows can collect.

Live at **[revesvoir.com](https://revesvoir.com)**.

## What it is

A session walks through:

1. **Arrival** — a cinematic etymology sequence
2. **Circling** — name what you're carrying, or ask the app to find it
3. **Word Weaving** — three rounds of dragging seed words together; each pair generates an emergent word
4. **Pile Sort** — group the emerged words into clusters that make intuitive sense
5. **Timed Write** — a few minutes of stream-of-consciousness against an AI-generated prompt
6. **Synthesis** — Claude reads everything you produced and reflects back the question and the answer it's already in
7. **Go Deeper** *(optional)* — Ambiguity Cards (procedurally-generated inkblots) and Sentence Completion, then a second-pass synthesis

Every session also drops a **Message in a Bottle** onto a shared shore. Future visitors see what others left.

## Stack

- **Frontend** — Vite + React 18, no UI framework. Animations are SVG + Canvas + CSS keyframes; the persistent water layer underneath is a hand-rolled WebGL system.
- **Backend** — a single [Cloudflare Worker](worker.js) at `revesvoir-api.nicole-scheid.workers.dev`. It proxies the Anthropic Claude API for the exercise endpoints (`/emerge`, `/analyze`, `/write-prompt`, `/synthesize`, `/sentence-stems`, `/deep-synthesize`) and stores Shore bottles in a KV namespace.
- **Persistence** — session state is held in a React reducer and mirrored to `localStorage` so a refresh resumes mid-session.

The frontend has no auth and no per-user storage; everything except the Shore bottles lives only in the user's browser.

## Local development

```bash
npm install
npm run dev      # vite on :3000
npm run build    # production build to dist/
npm run preview  # preview the production build
```

The frontend talks to the deployed Worker at `revesvoir-api.nicole-scheid.workers.dev`. If you want to run the Worker locally too, you'll need [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) installed and an `ANTHROPIC_API_KEY` Worker secret set.

## Deploy

- **Frontend** — `npm run build` produces `dist/`, which is deployed to Cloudflare Pages.
- **Worker** — `wrangler deploy worker.js` (a `wrangler.toml` is not yet committed; the deploy uses CLI flags).

## Repository layout

```
src/
  components/     Arrival, Circling, WaterCanvas (the persistent water layer)
  exercises/      WordWeaving, PileSort, TimedWrite, AmbiguityCards, SentenceCompletion
  contexts/       SessionContext — reducer + API helpers + localStorage persistence
  systems/        WaterSystem (WebGL water) and AudioSystem (synthesized ambient + haptics)
  styles/         global tokens
worker.js         Single-file Cloudflare Worker
```

## Status

Beta. This is a personal portfolio project, not a commercial product.
