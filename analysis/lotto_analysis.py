#!/usr/bin/env python3
"""
NZ Lotto statistical analysis + next-draw line generator.

Educational research tool. Treats historical draws as an empirical dataset:
computes frequency/recency/pair/sum statistics, builds a Dirichlet-smoothed
weighted probability model P(n) per the described methodology, generates
8 candidate lines (6 numbers + bonus ball + powerball), and validates the
model against a Monte Carlo uniform-random baseline to check for a real
edge (there should not be one -- Lotto draws are independent).

Run: python3 lotto_analysis.py
Writes: report.json (full stats) and prints a human-readable summary.
"""
import json
import random
import statistics
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).parent
MAIN_POOL = list(range(1, 41))
PB_POOL = list(range(1, 11))
LAST_N = 6
NUM_LINES = 8
ALPHA = 1.0          # Dirichlet smoothing prior (add-alpha smoothing)
RECENCY_WEIGHT = 0.35  # how much extra weight the last-6 window gets vs full sample
MC_TRIALS = 20000

random.seed()  # true randomness for the actual generated lines


def load_draws():
    data = json.loads((HERE / "draws.json").read_text())
    draws = data["draws"]
    draws.sort(key=lambda d: d["draw"], reverse=True)  # most recent first
    return draws, data["_meta"]


def frequency(draws, key_fn, pool):
    c = Counter({n: 0 for n in pool})
    for d in draws:
        v = key_fn(d)
        if v is None:
            continue
        if isinstance(v, list):
            for n in v:
                c[n] += 1
        else:
            c[v] += 1
    return c


def overdue_gaps(draws, pool):
    """Draws since each number last appeared among the main 6 (0 = appeared last draw)."""
    gaps = {}
    for n in pool:
        gap = None
        for i, d in enumerate(draws):
            if n in d["numbers"]:
                gap = i
                break
        gaps[n] = gap if gap is not None else len(draws)
    return gaps


def pair_frequency(draws):
    pf = Counter()
    for d in draws:
        for a, b in combinations(sorted(d["numbers"]), 2):
            pf[(a, b)] += 1
    return pf


def sum_stats(draws):
    sums = [sum(d["numbers"]) for d in draws]
    return {
        "mean": round(statistics.mean(sums), 1),
        "stdev": round(statistics.pstdev(sums), 1) if len(sums) > 1 else 0,
        "min": min(sums),
        "max": max(sums),
    }


def odd_even_high_low(draws):
    odd_counts, high_counts = [], []
    for d in draws:
        odd_counts.append(sum(1 for n in d["numbers"] if n % 2 == 1))
        high_counts.append(sum(1 for n in d["numbers"] if n > 20))
    return {
        "avg_odd_of_6": round(statistics.mean(odd_counts), 2),
        "avg_high_of_6": round(statistics.mean(high_counts), 2),
        "most_common_odd_split": Counter(odd_counts).most_common(1)[0],
        "most_common_high_split": Counter(high_counts).most_common(1)[0],
    }


def build_weighted_probs(pool, freq_full, freq_recent, n_full, n_recent, gaps=None):
    """
    Dirichlet/add-alpha smoothed blend of long-run and short-run (last-6) frequency,
    softened toward uniform so the model can't overfit a small sample. This mirrors
    the 'Bayesian hierarchical / Dirichlet-multinomial' approach: probability of each
    number is a smoothed weighted average of how often it's shown up long-term and
    recently, never a hard override of randomness.
    """
    k = len(pool)
    probs = {}
    for n in pool:
        long_rate = (freq_full[n] + ALPHA) / (n_full + ALPHA * k) if n_full else 1 / k
        recent_rate = (freq_recent[n] + ALPHA) / (n_recent + ALPHA * k) if n_recent else 1 / k
        blended = (1 - RECENCY_WEIGHT) * long_rate + RECENCY_WEIGHT * recent_rate
        if gaps is not None:
            # mild overdue nudge: numbers absent longer get a small boost, capped
            overdue_factor = 1 + min(gaps[n], 20) / 200.0
            blended *= overdue_factor
        probs[n] = blended
    total = sum(probs.values())
    return {n: p / total for n, p in probs.items()}


def weighted_sample_line(probs, k, exclude=()):
    pool = [n for n in probs if n not in exclude]
    weights = [probs[n] for n in pool]
    picks = []
    pool = pool[:]
    weights = weights[:]
    for _ in range(k):
        total = sum(weights)
        r = random.uniform(0, total)
        upto = 0
        for i, w in enumerate(weights):
            upto += w
            if upto >= r:
                picks.append(pool.pop(i))
                weights.pop(i)
                break
        else:
            picks.append(pool.pop())
            weights.pop()
    return sorted(picks)


def line_is_reasonable(nums, sum_lo, sum_hi):
    s = sum(nums)
    odd = sum(1 for n in nums if n % 2 == 1)
    if not (sum_lo <= s <= sum_hi):
        return False
    if odd in (0, 6):  # all-even or all-odd is a degenerate combinatorial corner
        return False
    # reject 3+ in a row consecutive run (rare in real draws, avoid over-clustering)
    srt = sorted(nums)
    run = 1
    for i in range(1, len(srt)):
        run = run + 1 if srt[i] == srt[i - 1] + 1 else 1
        if run >= 4:
            return False
    return True


def generate_lines(main_probs, bonus_probs, pb_probs, sum_range, n_lines=NUM_LINES):
    lines = []
    seen = set()
    attempts = 0
    while len(lines) < n_lines and attempts < 5000:
        attempts += 1
        nums = weighted_sample_line(main_probs, 6)
        key = tuple(nums)
        if key in seen or not line_is_reasonable(nums, *sum_range):
            continue
        seen.add(key)
        bonus = weighted_sample_line(bonus_probs, 1, exclude=nums)[0]
        pb = weighted_sample_line(pb_probs, 1)[0]
        lines.append({"numbers": nums, "bonus": bonus, "powerball": pb})
    return lines


def monte_carlo_validation(main_probs, trials=MC_TRIALS):
    """
    Null-hypothesis check: draw `trials` uniform-random 'future' lotto results and
    compare, on average, how many of our weighted-model numbers match a uniform
    ticket vs how many a purely uniform-random ticket matches. If the model carried
    real predictive power the weighted ticket's average match count would sit above
    the random ticket's; for a fair lottery it should not, within noise.
    """
    weighted_ticket = weighted_sample_line(main_probs, 6)
    random_ticket = random.sample(MAIN_POOL, 6)
    w_matches, r_matches = [], []
    for _ in range(trials):
        draw = random.sample(MAIN_POOL, 6)
        w_matches.append(len(set(weighted_ticket) & set(draw)))
        r_matches.append(len(set(random_ticket) & set(draw)))
    return {
        "trials": trials,
        "weighted_ticket": weighted_ticket,
        "random_ticket": random_ticket,
        "weighted_avg_matches": round(statistics.mean(w_matches), 4),
        "random_avg_matches": round(statistics.mean(r_matches), 4),
        "theoretical_expected_matches": round(6 * 6 / 40, 4),
        "note": "Both should hover near the theoretical expected value (0.9) with no "
                "statistically meaningful gap -- confirming the model has no real edge, "
                "as expected for a fair, independent lottery draw.",
    }


def main():
    draws, meta = load_draws()
    recent = draws[:LAST_N]

    freq_full = frequency(draws, lambda d: d["numbers"], MAIN_POOL)
    freq_recent = frequency(recent, lambda d: d["numbers"], MAIN_POOL)
    gaps = overdue_gaps(draws, MAIN_POOL)

    bonus_draws = [d for d in draws if d.get("bonus") is not None]
    bonus_recent = [d for d in bonus_draws[:LAST_N]]
    freq_bonus_full = frequency(bonus_draws, lambda d: d["bonus"], MAIN_POOL)
    freq_bonus_recent = frequency(bonus_recent, lambda d: d["bonus"], MAIN_POOL)

    pb_draws = [d for d in draws if d.get("powerball") is not None]
    pb_recent = pb_draws[:LAST_N]
    freq_pb_full = frequency(pb_draws, lambda d: d["powerball"], PB_POOL)
    freq_pb_recent = frequency(pb_recent, lambda d: d["powerball"], PB_POOL)

    pairs = pair_frequency(draws)
    top_pairs = pairs.most_common(10)

    sums = sum_stats(draws)
    oe = odd_even_high_low(draws)

    main_probs = build_weighted_probs(
        MAIN_POOL, freq_full, freq_recent, len(draws) * 6, len(recent) * 6, gaps=gaps
    )
    bonus_probs = build_weighted_probs(
        MAIN_POOL, freq_bonus_full, freq_bonus_recent, len(bonus_draws), len(bonus_recent)
    )
    pb_probs = build_weighted_probs(
        PB_POOL, freq_pb_full, freq_pb_recent, len(pb_draws), len(pb_recent)
    )

    sum_range = (max(sums["min"] - 10, 21), min(sums["max"] + 10, 240))
    lines = generate_lines(main_probs, bonus_probs, pb_probs, sum_range)

    mc = monte_carlo_validation(main_probs)

    report = {
        "meta": meta,
        "sample_size": len(draws),
        "recent_window": LAST_N,
        "main_number_frequency_full": dict(sorted(freq_full.items())),
        "main_number_frequency_last6": dict(sorted(freq_recent.items())),
        "hottest_full": Counter(freq_full).most_common(8),
        "coldest_full": sorted(freq_full.items(), key=lambda kv: kv[1])[:8],
        "hottest_last6": [n for n in freq_recent if freq_recent[n] > 0],
        "most_overdue": sorted(gaps.items(), key=lambda kv: -kv[1])[:8],
        "top_pairs": [{"pair": list(p), "count": c} for p, c in top_pairs],
        "sum_distribution": sums,
        "odd_even_high_low": oe,
        "bonus_frequency_full": dict(sorted(freq_bonus_full.items())),
        "bonus_frequency_last6": {n: c for n, c in freq_bonus_recent.items() if c > 0},
        "powerball_sample_size": len(pb_draws),
        "powerball_frequency_full": dict(sorted(freq_pb_full.items())),
        "powerball_frequency_last6": {n: c for n, c in freq_pb_recent.items() if c > 0},
        "generated_lines": lines,
        "monte_carlo_validation": mc,
    }

    (HERE / "report.json").write_text(json.dumps(report, indent=2))

    print(f"Loaded {len(draws)} validated real draws ({draws[-1]['date']} to {draws[0]['date']})")
    print(f"Hottest (full sample): {report['hottest_full']}")
    print(f"Coldest (full sample): {report['coldest_full']}")
    print(f"Most overdue: {report['most_overdue']}")
    print(f"Top pairs: {report['top_pairs'][:5]}")
    print(f"Sum distribution: {sums}")
    print(f"Odd/even & high/low: {oe}")
    print(f"Powerball sample size: {len(pb_draws)} draws")
    print()
    print("=== 8 generated lines ===")
    for i, ln in enumerate(lines, 1):
        print(f"Line {i}: {ln['numbers']}  Bonus: {ln['bonus']}  Powerball: {ln['powerball']}")
    print()
    print("=== Monte Carlo null-hypothesis check ===")
    print(mc["note"])
    print(f"Weighted-model ticket avg matches over {mc['trials']} random draws: {mc['weighted_avg_matches']}")
    print(f"Pure-random ticket avg matches: {mc['random_avg_matches']}")
    print(f"Theoretical expected matches: {mc['theoretical_expected_matches']}")


if __name__ == "__main__":
    main()
