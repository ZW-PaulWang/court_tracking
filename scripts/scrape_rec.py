# Scrapes open Harvard Recreation tennis slots from the Fusion portal and writes data/rec.json.

import json, re, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests
from bs4 import BeautifulSoup

# 0. Paths and constants. Resolved from this file, so the script runs from any working directory.
root = Path(__file__).resolve().parents[1]
out_path = root / "data" / "rec.json"
base = "https://membership.gocrimson.com"
classification = "dc42ec33-82df-44ca-b06c-109c3685395d"
portal = f"{base}/program?classificationId={classification}"

programs = {  # Fusion program ids -> (venue code, court label)
    "d484fe60-df15-44e5-9681-aa9eff3ce528": ("B", "16 & 17"),
    "3b92dfe2-3eb0-4860-b07f-f058e0e18019": ("M", "Court 1"),
    "58d5f7ab-8c69-41e7-bc50-a1ccbe58459a": ("M", "Court 2"),
    "02868885-c471-42d4-a03d-9e3cbe889bed": ("M", "Court 3"),
    "1b4679e7-5fa4-4b05-a16c-4dc892974716": ("M", "Court 4"),
    "442d6bde-6c26-46cd-bec8-9e1d7047e7b9": ("M", "Court 5"),
    "e11bd3c1-4e58-4b8d-98c7-9fbc1838216e": ("M", "Court 6"),
}

session = requests.Session()
session.headers.update({"User-Agent": "pauls-court-watch (github.com/ZW-PaulWang/court_tracking)"})

# 1. Helpers. Fusion posts the whole appointment array back, so values need its own string encoding.
def form_value(v):
    if v is None: return ""
    if v is True: return "true"
    if v is False: return "false"
    return str(v)

def to_minutes(h, m, ap):
    h = int(h)
    if ap.upper() == "PM" and h != 12: h += 12
    if ap.upper() == "AM" and h == 12: h = 0
    return h * 60 + int(m)

# Pulls "7:30 PM - 8:30 PM" plus "2 Spots available" out of a rendered card.
time_re = re.compile(r"(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)", re.I)
open_re = re.compile(r"(\d+)\s+Spots?\s+available", re.I)

# 2. Walk every program, then every date inside that program's released window.
slots, all_dates = [], set()
for pid, (venue, court) in programs.items():
    r = session.get(f"{base}/Program/GetProgramInstances", params={"programID": pid}, timeout=45)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    field = soup.select_one("#ApptInfo")
    if field is None:
        print(f"  ! {court}: no ApptInfo field, skipping", file=sys.stderr); continue
    appts = json.loads(field["value"])
    if not appts:
        print(f"  - {court}: no instances published"); continue

    base_form = []
    for i, a in enumerate(appts):
        for k, v in a.items():
            base_form.append((f"appointments[{i}][{k}]", form_value(v)))
    base_form.append(("programID", pid))

    dates = sorted({a["StartDate"][:10] for a in appts})
    all_dates.update(dates)
    found = 0
    for ds in dates:
        y, m, d = ds.split("-")
        form = base_form + [("year", int(y)), ("month", int(m)), ("day", int(d))]
        p = session.post(f"{base}/Program/FilterProgramInstances", data=form,
                         headers={"X-Requested-With": "XMLHttpRequest"}, timeout=45)
        p.raise_for_status()
        for card in BeautifulSoup(p.text, "html.parser").select(".program-instance-card"):
            text = " ".join(card.get_text(" ", strip=True).split())
            tm, av = time_re.search(text), open_re.search(text)
            if not (tm and av): continue  # no "N Spots available" means the slot is taken
            slots.append({"v": venue, "court": court, "date": ds,
                          "start": to_minutes(tm.group(1), tm.group(2), tm.group(3)),
                          "end":   to_minutes(tm.group(4), tm.group(5), tm.group(6)),
                          "open":  int(av.group(1))})
            found += 1
    print(f"  {court}: {found} open of {len(appts)} published")

if not all_dates:
    sys.exit("No dates returned by the portal — refusing to overwrite data/rec.json with an empty file.")

# 3. Sanity-check before writing, so a broken parse fails loudly instead of publishing nonsense.
assert all(s["end"] > s["start"] for s in slots), "found a slot ending before it starts"
assert all(s["open"] > 0 for s in slots), "found a slot with no spots in the open list"

slots.sort(key=lambda s: (s["date"], s["start"], s["v"], s["court"]))
doc = {
    "source": "Harvard Recreation",
    "url": portal,
    "venues": [{"code": "M", "name": "Murr Indoor"}, {"code": "B", "name": "Beren"}],
    "scraped": datetime.now(timezone(timedelta(hours=-5))).isoformat(timespec="seconds"),
    "window": {"from": min(all_dates), "to": max(all_dates)},
    "slots": slots,
}
out_path.write_text(json.dumps(doc, indent=1) + "\n")
print(f"Wrote {out_path.relative_to(root)}: {len(slots)} open slots, {min(all_dates)} -> {max(all_dates)}")
