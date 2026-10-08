# What `npm run check` costs, and where

> **Run it yourself: `npm run check:times`** — it times every suite and names any
> that is more than **25% of the whole check** on its own. `--ci` makes it exit
> non-zero. The numbers below are one reading; the script is the durable half,
> because a file of timings is stale the day after it is taken and nobody making
> a suite slow goes looking for it.
>
> **The bar started as 20x the median and that was wrong.** Run against the real
> repo it fired on **six** suites, because 27 of the 39 finish in under a second
> and drag the median to 0.6s. A smoke alarm that flags 15% of the building is
> the same failure as one that never sounds. Share-of-total fires on exactly one
> name: **blacksite at 45%**.


## The current reading — 2026-08-15

```
195.3s  43%  blacksite     ← the only suite over the 25% bar
 85.0s  19%  crashmas
 47.1s  10%  frostfell
 43.5s  10%  ironbridge
 27.9s   6%  dungeon
 11.3s   3%  grimhold
                              452.2s total · median suite 0.7s · bar 113.0s
```

**Blacksite is 195 seconds — 43% of the whole check, and the only suite over the
bar.** That is the number this file exists to put somewhere its owner would find
it, because nobody running one suite ever sees the total. Nothing here is a
request to change it; it is the reading, and what to do about it is blacksite's
call.

**And frostfell is the transferable half, because it used to be the worst one
here and is now third at 10%.** What moved it, in order of how much each was
worth:

1. **Stop running the probe at a sample nobody reads.** The deep arms — every
   card priced, every habit ablated, the variance decomposition — moved behind
   env knobs (`FF_CARDS`, `FF_ABLATE`, `FF_VARIANCE` and a dozen more). The
   default check runs them at a depth that proves they still work; the sample
   that produces a *finding* is a thing you ask for. That was most of it.
2. **Pool the runs.** A worker per core, jobs batched so a fourteen-arm sweep
   is one call rather than fourteen. Worth about 3% on its own — far less than
   it looks like it should be, which is worth knowing before anybody spends a
   day on it.
3. **Add coverage anyway.** Since then the render suite gained a per-card
   sweep, a per-foe sweep, a real glyph-advance table and two more device
   shapes, and it is *still* 10%. Widening a check is cheap; running it deep by
   default is not.

The general form: **a suite is slow because of what it runs by default, not
because of what it can run.** Frostfell can burn 50,000 runs on one question and
does, several times a round — none of it inside `npm run check`.

---

Measured 2026-08-14 on the CI-sized box (4 cores), each suite timed on its own,
cold, via `npm run test:<name>`. Total **531.9s — just under nine minutes** across
39 suites.

This file exists because the number is nobody's job. Every game in here is
maintained separately, so the person who makes one suite slow never sees the
total, and the person waiting on the total does not know which suite to blame.

## The whole table, slowest first

```
210.9s  blacksite      ← 45% of the entire check, on its own (second reading)
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
