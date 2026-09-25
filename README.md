# Crimson Court Watch

One calendar for open tennis courts across Harvard's booking portals. Static site, no backend.

**Live:** https://zw-paulwang.github.io/court_tracking/

## How it works

`index.html` is a single static page that fetches JSON from `data/` and renders a week grid of
**bookable** slots only. Each data file carries its own scrape timestamp and released window, so the
page can tell "this day is full" apart from "this day has not been released yet" and shows them
differently.

Adding a source means adding `data/<name>.json` in the same shape and one `--venue-<CODE>` color in
the stylesheet. No other code changes.

```
data/rec.json    Harvard Recreation — Murr Indoor courts 1-6, Beren 16 & 17
data/shad.json   Shad Hall — Tennis/Pickleball courts 1-4
data/bu.json     BU FitRec — Track & Tennis Center
```

### Data shape

```jsonc
{
  "source": "Harvard Recreation",
  "url":    "https://…",                 // where a slot chip links to
  "venues": [{"code": "M", "name": "Murr Indoor"}],
  "scraped": "2026-09-25T18:40:00-04:00",
  "window": {"from": "2026-09-25", "to": "2026-10-01"},   // what the portal has released
  "slots": [
    {"v": "M", "court": "Court 1", "date": "2026-09-28",
     "start": 1080, "end": 1140, "open": 1}               // minutes from midnight
  ]
}
```

Only open slots belong in `slots`. A released day with nothing free is an empty day, not a missing one —
that distinction is what `window` preserves.

## Refreshing

One daily run does everything. The local scheduled task is the **single writer** for `data/`:

1. scrapes all three portals through the browser
2. writes `data/*.json`
3. rebuilds `artifact.html` and republishes the private Claude artifact
4. runs `scripts/sync.sh`, which commits and pushes, redeploying the Pages site

Shad Hall sits behind HBS SSO, so CI cannot reach it and no stored secret fixes that — an automated
login would still hit Duo. That is why the pipeline runs locally rather than in Actions.

### Why `sync.sh` clones instead of committing in place

The Cowork sandbox mounts this folder **create-and-modify only**: files can be written but never
unlinked. Git needs to delete its own `.lock` files between operations, so a repo living here accepts
exactly one commit and then fails with `cannot lock ref 'HEAD'` forever after.

`scripts/sync.sh` therefore clones the GitHub repo into a temp dir on the sandbox's own filesystem,
copies the current files in, and commits and pushes from there. Git in this folder still works fine
from a normal macOS terminal — the limitation is only the sandbox's view of the mount.

`.github/workflows/refresh.yml` is **manual-only on purpose**. It can refresh the Harvard Recreation
half from the Actions tab as a fallback, but it is not scheduled: two writers committing `data/rec.json`
would race and the daily push would start failing as a non-fast-forward.

The page marks any source scraped more than 12 hours ago as possibly out of date, so a skipped run shows
up on the site instead of passing as current.

Run the public scraper by hand:

```bash
pip install -r requirements.txt
python scripts/scrape_rec.py
```

### Push credentials

Create `.gitcreds` in the repo root (gitignored) with a single line:

```
https://USERNAME:TOKEN@github.com
```

Use a fine-grained PAT scoped to this repo with **Contents: read/write** and nothing else.
`sync.sh` hands the file to git's `store` credential helper, so git reads the token directly — it is
never interpolated into a command line or printed. Push output is additionally filtered so that a
credential in any remote URL shows as `https://***@github.com`.

The token sits in plaintext on disk. Scope it to this one repo, give it an expiry, and rotate it if the
machine changes hands.

## Known limits

- **Short horizons.** Shad releases a rolling 3-day window and Harvard Recreation a rolling 7-day one.
  Nothing further ahead exists to show, whatever the calendar suggests.
- **Availability moves fast.** The grid is a snapshot. Confirm on the portal before counting on a slot.
- **BU reports availability, but only 48 hours out, and the parser is unproven.** BU's calendar labels
  a block `Unavailable` whether it is already booked *or* simply more than 48 hours away, so the two
  cannot be told apart from the page. `data/bu.json` therefore treats only the 48-hour horizon as
  released. Across 342 blocks over 63 days, every single one read `Unavailable` — consistent with a
  very popular facility, but it also means the "open slot" branch of the BU parser has never matched
  real data. The scraper records a census of block statuses each run so an unrecognised status shows up
  instead of being silently counted as zero.

## Deploying

Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
Every push to `main`, including the bot's data commits, redeploys the site.
