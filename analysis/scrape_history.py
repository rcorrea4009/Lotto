#!/usr/bin/env python3
"""
Best-effort NZ Lotto history scraper -- run this on a machine/network that can
actually reach lottoresults.co.nz (this repo's own dev sandbox has gambling-
category domains blocked at the network layer, so it could not be written
against a live page and has NOT been able to be tested end-to-end here).

Pulls monthly archive pages from lottoresults.co.nz (simple server-rendered
HTML, no JS rendering required) and writes every draw it can parse into a CSV
in the exact column format NZLottoAnalyzer.jsx / index.html expect for file
upload: Date,N1,N2,N3,N4,N5,N6,Bonus,Powerball -- so the output drops straight
into the analyzer's "UPLOAD FILE" button, or into analysis/draws.json (adapt
row_to_draw_json below) for lotto_analysis.py.

Usage:
    pip install requests beautifulsoup4   # not in the repo's own requirements
    python3 scrape_history.py --months 2026-01 2026-02 2026-03 ... --out draws.csv

If lottoresults.co.nz has changed its markup since this was written, the
regex/selector fallbacks below will likely return 0 rows for a page -- print
the page's raw HTML for one draw and adjust NUMBER_BLOCK_RE / the BeautifulSoup
selectors accordingly, same troubleshooting spirit as
lotto-automation/auto-fill-lotto.js.
"""
import argparse
import csv
import re
import sys
import time
from datetime import datetime

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4")

BASE = "http://lottoresults.co.nz/lotto"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; lotto-history-research/1.0)"}

# Matches 6 numbers (1-40), optionally followed by a bonus ball and/or a
# powerball number, in whatever separator the page uses.
NUMBER_BLOCK_RE = re.compile(
    r"\b(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\b"
)


def fetch(url, retries=3, delay=2):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if attempt == retries - 1:
                print(f"  ! failed to fetch {url}: {e}", file=sys.stderr)
                return None
            time.sleep(delay * (attempt + 1))


def month_url(year_month):
    """'2026-08' -> http://lottoresults.co.nz/lotto/august-2026"""
    dt = datetime.strptime(year_month, "%Y-%m")
    return f"{BASE}/{dt.strftime('%B').lower()}-{dt.year}"


def parse_month_page(html):
    """
    Returns a list of dicts: {date, numbers, bonus, powerball, draw}.
    Best-effort: looks for per-draw blocks first (BeautifulSoup, common class
    naming), falls back to regex-scanning the whole page text for 6-number runs.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    # Attempt 1: structured blocks -- adjust these selectors if the site's
    # markup differs (view-source on one draw page to check class names).
    candidates = soup.select(
        "[class*=result], [class*=draw], .lotto-result, .result-row"
    )
    for block in candidates:
        text = block.get_text(" ", strip=True)
        m = NUMBER_BLOCK_RE.search(text)
        if not m:
            continue
        nums = [int(x) for x in m.groups()]
        if len(set(nums)) != 6 or not all(1 <= n <= 40 for n in nums):
            continue
        date_m = re.search(r"\d{1,2}\s+\w+\s+\d{4}", text)
        bonus_m = re.search(r"bonus[^\d]{0,10}(\d{1,2})", text, re.I)
        pb_m = re.search(r"power\s*ball[^\d]{0,10}(\d{1,2})", text, re.I)
        draw_m = re.search(r"draw[^\d]{0,5}(\d{3,5})", text, re.I)
        rows.append({
            "date": date_m.group(0) if date_m else "",
            "numbers": sorted(nums),
            "bonus": int(bonus_m.group(1)) if bonus_m else "",
            "powerball": int(pb_m.group(1)) if pb_m else "",
            "draw": int(draw_m.group(1)) if draw_m else "",
        })

    if rows:
        return rows

    # Attempt 2 (fallback): scan the whole page text for 6-number runs.
    text = soup.get_text(" ", strip=True)
    for m in NUMBER_BLOCK_RE.finditer(text):
        nums = [int(x) for x in m.groups()]
        if len(set(nums)) == 6 and all(1 <= n <= 40 for n in nums):
            rows.append({"date": "", "numbers": sorted(nums), "bonus": "", "powerball": "", "draw": ""})
    return rows


def normalize_date(raw):
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", nargs="+", required=True, help="e.g. 2026-01 2026-02 ... (YYYY-MM)")
    ap.add_argument("--out", default="scraped_draws.csv")
    args = ap.parse_args()

    all_rows = []
    for ym in args.months:
        url = month_url(ym)
        print(f"Fetching {url} ...")
        html = fetch(url)
        if not html:
            continue
        rows = parse_month_page(html)
        print(f"  parsed {len(rows)} draw(s)")
        all_rows.extend(rows)
        time.sleep(1)  # be polite

    if not all_rows:
        print("No rows parsed -- the site's markup likely differs from what this script expects.")
        print("Fetch one draw page manually and adjust the selectors / NUMBER_BLOCK_RE.")
        return

    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Date", "N1", "N2", "N3", "N4", "N5", "N6", "Bonus", "Powerball", "Draw"])
        for r in all_rows:
            date = normalize_date(r["date"]) if r["date"] else ""
            w.writerow([date, *r["numbers"], r["bonus"], r["powerball"], r["draw"]])

    print(f"\nWrote {len(all_rows)} draws to {args.out}")
    print("Upload this file via the analyzer's UPLOAD FILE button, or feed it into")
    print("analysis/lotto_analysis.py by converting rows into analysis/draws.json's format.")


if __name__ == "__main__":
    main()
