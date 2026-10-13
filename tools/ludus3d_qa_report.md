# Ludus Maximus 3D QA monkey report

Generated 2026-10-13 by tools/ludus3d_monkey.mjs

Total findings: 8 (high 0, med 0, low 8)

## phone (seed 8, 47 steps, final {"week":3,"gold":5160,"glads":3,"busy":false,"scene":"hub"})

- [low] slow @ open roster: opening "roster" took 9926ms
- [low] slow @ click: step "click" took 9902ms
- [low] slow @ run: longest main-thread task 3799ms (software GL, informational)

## landscape (seed 8, 47 steps, final {"week":3,"gold":5331,"glads":3,"busy":false,"scene":"hub"})

- [low] slow @ open roster: opening "roster" took 9908ms
- [low] slow @ run: longest main-thread task 3918ms (software GL, informational)

## desktop (seed 8, 47 steps, final {"week":3,"gold":5152,"glads":3,"busy":false,"scene":"hub"})

- [low] slow @ open roster: opening "roster" took 12332ms
- [low] slow @ click: step "click" took 18053ms
- [low] slow @ run: longest main-thread task 4561ms (software GL, informational)
