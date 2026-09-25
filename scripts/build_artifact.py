# Builds artifact.html: the same page as index.html but with data inlined, for publishing as a Claude Artifact.

import json, re
from pathlib import Path

# 0. Paths. The Artifact tool supplies its own doctype/head/body, so this emits a fragment.
root = Path(__file__).resolve().parents[1]
page = (root / "index.html").read_text()
out_path = root / "artifact.html"

# 1. Keep everything from <title> through </body>, dropping the document wrapper.
#    (before: "<!doctype html><html><head><meta…><title>X</title>…</body></html>" -> after: "<title>X</title>…")
start = page.index("<title>")
body_open = re.search(r"<body[^>]*>", page)
fragment = page[start:body_open.start()] + page[body_open.end():page.rindex("</body>")]

# 2. Drop the <meta> and favicon <link> lines the wrapper already provides, keep the font stylesheet.
fragment = re.sub(r'^\s*<meta[^>]*>\s*$\n?', '', fragment, flags=re.M)
fragment = re.sub(r'^\s*<link rel="icon".*$\n?', '', fragment, flags=re.M)  # data-URI icon contains ">", so match to EOL

# 3. Inline the data so the published page renders at rest, with no fetch.
docs = [json.loads(p.read_text()) for p in sorted((root / "data").glob("*.json"))]
assert docs, "no data files found — run the scrapers first"
seed = "<script>window.__DATA__ = " + json.dumps(docs, separators=(",", ":")) + ";</script>\n"
fragment = fragment.replace("<script>", seed + "<script>", 1)

out_path.write_text(fragment)
n = sum(len(d["slots"]) for d in docs)
print(f"Wrote {out_path.relative_to(root)}: {len(docs)} sources, {n} open slots, {len(fragment)//1024} KB")
