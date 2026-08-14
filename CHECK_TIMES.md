# What `npm run check` costs, and where

Measured 2026-08-14 on the CI-sized box (4 cores), each suite timed on its own,
cold, via `npm run test:<name>`. Total **531.9s — just under nine minutes** across
39 suites.

This file exists because the number is nobody's job. Every game in here is
maintained separately, so the person who makes one suite slow never sees the
total, and the person waiting on the total does not know which suite to blame.

## The whole table, slowest first

```
247.8s  blacksite      ← 46% of the entire check, on its own
 89.8s  crashmas
 54.0s  frostfell
 48.9s  ironbridge
 33.2s  dungeon
 13.1s  grimhold
  6.3s  wildwalk
  5.5s  pusher
  5.0s  boss
  4.7s  emberkin
  3.1s  joske
  2.2s  beasts
   ...  (27 more, all under 2s)
--------
531.9s  total
```

## The one thing worth acting on

**`blacksite` is 46% of the check by itself** and is 4.6x the next-largest
non-trivial suite. Halving it would take about two minutes off every `npm run
check` anyone in this repo runs, which is more than every other suite combined
could offer.

Two suites — **blacksite (247.8s)** and **crashmas (89.8s)** — are **63% of the
total**. The remaining 37 average under 4s each.

## What frostfell did about its own share, in case it transfers

frostfell was the slowest suite in the repo before this measurement and is now
third at 10%. What moved it, in order of how much it was worth:

1. **Measure first.** Where the time went was reasoned about three times and
   answered wrong three times, once blaming three arms that are switched off by
   default. A per-section timer (`FF_TIME=1`) settled it in ten minutes; the
   three slowest sections turned out to be 70% of the suite.
2. **A reusable worker pool** (`tests/frostfell_pool.mjs`), not a worker per unit
   of work — loading the game costs ~200ms per thread, which is more than most
   individual jobs. Reused threads, batched jobs.
3. **Half the cores, not all of them.** `cores - 1` measured *worse* than
   `cores / 2` on a 4-core box: 5.7s against 5.3s, with 4 threads at 7.0s.
4. **Keep a serial path and assert the two agree.** `FF_JOBS=1` runs everything
   inline; the suite requires inline and pooled output to be **byte-identical**.
   That check caught two silent corruptions a normal assertion missed.

None of this is specific to frostfell. Whether it applies to blacksite is for
whoever owns blacksite to judge — this file is the measurement, not a patch.
