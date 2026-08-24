# NZ Lotto statistical analysis

Educational analysis of real NZ Lotto draws: frequency (last-6 vs full sample),
overdue/hot/cold numbers, pair co-occurrence, sum/odd-even distribution, a
Dirichlet-smoothed weighted probability model, and a Monte Carlo check against
pure-random guessing. See the [published report](https://claude.ai/code/artifact/4b0e89e5-360d-4dcb-821d-9f4e0b0cfd71) for the readable writeup.

## Files

- `draws.json` -- 44 real, cross-validated NZ Lotto draws (10 Jan - 19 Aug 2026),
  compiled via web search because `mylotto.co.nz` is unreachable from this dev
  sandbox (gambling-category domains are blocked at the network egress proxy for
  every tool, confirmed via direct `curl` -> 403). `_meta` in the file documents
  provenance and known gaps (Powerball numbers only found for 17/44 draws).
- `lotto_analysis.py` -- run with `python3 lotto_analysis.py` (stdlib only, no
  dependencies). Reads `draws.json`, writes `report.json`, and prints a summary
  including the 8 generated lines.
- `report.json` -- output of the above; this is the data baked into the
  published HTML report.
- `scrape_history.py` -- best-effort scraper for `lottoresults.co.nz`'s monthly
  archive pages, meant to be run from a network that isn't gambling-blocked to
  pull a full 100+ draw history. Needs `pip install requests beautifulsoup4`.
  **Not verified end-to-end** since it couldn't be tested against the live site
  from here -- see the troubleshooting notes in its docstring if it returns 0 rows.

## Re-running with more data

Once you have a fuller CSV (e.g. from `scrape_history.py`, or by copying rows
from `mylotto.co.nz/results` by hand), either:
- Upload it directly in the NZLottoAnalyzer app (UPLOAD FILE button), which
  already accepts `Date,N1..N6,Bonus,Powerball` CSV/XLSX, or
- Convert it to `draws.json`'s shape and re-run `lotto_analysis.py` for the
  deeper stats (pairs, Monte Carlo validation, generated lines) that the app's
  built-in JS heuristics don't do.

## Disclaimer

This is a statistics/modeling exercise, not a prediction system. Lotto draws
are independent random events -- see the Monte Carlo section of the report,
which exists specifically to show the weighted model has no real edge over
random guessing.
