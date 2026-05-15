# UI build references

Drop anything in here that informs the v2 UI build — screenshots of apps we like, design inspiration, Figma exports, competitor UIs, sketches, voice/tone references, copy refs, etc.

Sub-folders are optional; organize however helps. Some patterns to consider as the folder grows:

```
references/
├── screenshots/              raw screenshots (PNG, JPG)
├── inspiration/              external apps + designs we want to channel
├── sketches/                 hand drawings, whiteboards, FigJam exports
├── voice-tone-refs/          brand voice examples
├── copy/                     reference copy / microcopy
└── links.md                  bookmark list with notes
```

## Conventions

- **Naming**: `<source>-<topic>-<date>.png` works well, e.g. `linear-issues-board-2026-05-15.png`. Date in `YYYY-MM-DD` matches the rest of the repo.
- **Annotations**: drop a short note next to each file if it's not self-explanatory. Either rename with a hint (`vercel-dashboard-good-empty-state.png`) or add to `links.md` / `notes.md`.
- **Size**: PNGs are fine. For larger captures (video, gifs), use Loom and put the link in a `links.md` rather than committing the binary.
- **What NOT to drop here**: real client data with secrets, customer screenshots that haven't been redacted, exported workbooks with PII.

## Gitignore

This folder is **tracked** by default — images go in git. If you need to ignore something specific, add a per-pattern entry to the repo-level `.gitignore`.
