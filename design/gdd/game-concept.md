# Game Concept: Pitch Story: Draft Day

*Created: 2026-10-25*
*Status: Draft*

---

## Elevator Pitch

> It's a Kairosoft-style football club manager where you draft tactic cards and players before every block of fixtures, watch your team auto-play the highlights with a few live calls, and grow a tiny pixel-art village club into Champions League winners.

---

## Core Identity

| Aspect | Detail |
| ---- | ---- |
| **Genre** | Management sim with roguelike deck-builder draft and auto-battler matches |
| **Platform** | Web / Browser and Mobile (engine undecided; decided by `/setup-engine`) |
| **Target Audience** | Cozy-management and deck-builder players (see Target Player Profile) |
| **Player Count** | Single-player |
| **Session Length** | 30 to 60 minutes (one season), 5 to 10 minute pickup blocks |
| **Monetization** | None yet. Anti-pillar: no energy timers or progress gating |
| **Estimated Scope** | Large (9–11 months to launch Core, up to 20 months for Full Vision, solo) |
| **Comparable Titles** | Pocket League Story, Game Dev Story, Slay the Spire, Super Auto Pets |

---

## Core Fantasy

"I built this club from nothing, and I watched every step." The player grows a muddy village side into a packed-stadium European champion, and gets to watch their own choices win matches.

---

## Unique Hook

It's like Pocket League Story, AND ALSO every block of fixtures starts with a roguelike card draft, so each stretch of the season is a new hand to build around. The club's growth feeds back into the draft: a bigger club widens and enriches the pool of cards you are dealt.

---

## Player Experience Analysis (MDA Framework)

### Target Aesthetics (What the player FEELS)

| Aesthetic | Priority | How We Deliver It |
| ---- | ---- | ---- |
| **Sensation** | 5 | Chunky pixel town, satisfying goal highlights, crowd sound |
| **Fantasy** | 2 | Founding a club and taking it to Europe |
| **Narrative** | 6 | Emergent player and club stories, light event text |
| **Challenge** | 3 | Reading your squad and drafting into it; tougher leagues |
| **Fellowship** | N/A | Single-player |
| **Discovery** | 4 | Hidden card, staff and trait synergies |
| **Expression** | 7 | Club colours, crest, stadium layout, playing style |
| **Submission** | 1 | Cozy growth loop, calm pace, short sessions |

### Key Dynamics

- Players hunt for synergies between squad, staff and cards.
- Players get attached to individual players and tell stories about them.
- Players check "one more block" because the next draft offer is unknown.

### Core Mechanics

1. **Block draft:** pick 1 of 3 tactic cards or player boosts before each block of about 4 fixtures.
2. **Auto-played matches with light live calls:** a deterministic event simulation shown as short highlights, with substitutions and tactic swaps as the live calls.
3. **Club and town management:** stadium, facilities, staff, training and finances, with visible town growth.
4. **Persistent squad:** players have traits, grow, age and become club legends.
5. **League ladder:** promotion and relegation from the village league up to European competition.

---

## Player Motivation Profile

### Primary Psychological Needs Served

| Need | How This Game Satisfies It | Strength |
| ---- | ---- | ---- |
| **Autonomy** | What to draft, how to invest, what playstyle the club becomes | Core |
| **Competence** | Synergies pay off visibly; standings prove the build | Core |
| **Relatedness** | Attachment to your players and the town reacting to your results | Supporting |

### Player Type Appeal (Bartle Taxonomy)

- [x] **Achievers**: trophies and a visible league ladder
- [x] **Explorers**: discovering hidden synergies
- [ ] **Socializers**: not served
- [ ] **Killers/Competitors**: not served (no PvP)

### Flow State Design

- **Onboarding curve**: the first season is a village league with three cards per draft and one live call, taught by doing.
- **Difficulty scaling**: league tiers raise opposition strength; the card pool widens as the club grows.
- **Feedback clarity**: every highlight event is tagged with the card or trait that caused it.
- **Recovery from failure**: a bad block costs money, form or fan mood; a bad season risks relegation. The squad, town and career always survive.

---

## Core Loop

### Moment-to-Moment (30 seconds)
Watch a match highlight and make a light live call (substitution or tactic swap) at a key moment, then see a goal or save that your build caused.

### Short-Term (5-15 minutes)
One match-block of about 4 fixtures: draft a card, set the lineup and training, watch the matches, see standings and rewards.

### Session-Level (30-120 minutes)
A season: several match-blocks with a management phase between them (stadium, facilities, staff, transfers, events). It ends with a trophy, promotion or relegation beat.

### Long-Term Progression
The squad persists as a career: players grow, age and become legends. The club, town and fan base grow permanently. The goal is climbing the league ladder; Core ends by winning tier 3 and unlocks New Game+, and the full vision runs to the Champions League.

### Retention Hooks
- **Curiosity**: the next draft offer and the transfer list
- **Investment**: a squad and town you have grown
- **Social**: none (single-player)
- **Mastery**: finding better synergies and winning in harder leagues

---

## Game Pillars

### Pillar 1: Watch It Pay Off
The match is the reward, and every system shows up on the pitch or in the town.

*Design test*: a feature with no visible expression in a highlight or the town gets one, or is cut.

### Pillar 2: Small Club, Big Dreams
Growth shows in the town and in the hand you're dealt: a bigger club means a wider, rarer draft pool. Growth is earned by results and smart drafting, not by waiting.

*Design test*: between a flashy new mode and a clearer growth step, the growth step wins.

### Pillar 3: Every Block Is a New Hand
The 4-fixture draft is the core rhythm, and no single card should always win. Mastery means drafting into your squad.

*Design test*: between a deeper management menu and a more interesting draft choice, the draft wins.

### Pillar 4: Cozy Pace
Losing is soft. A bad block costs money, form or fan mood; a bad season risks relegation; the squad, town and career always survive.

*Design test*: if a result can wipe progress, soften it.

### Pillar 5: Your Club, Your Players
Players are characters, and signature cards come from player traits, so the draft and attachment support each other.

*Design test*: between a new stat and a trait that gives a player personality, personality wins.

### Anti-Pillars (What This Game Is NOT)

- **NOT a licensed, stats-heavy simulation**: it would compromise Cozy Pace.
- **NOT real-time twitch control in matches**: it would compromise Watch It Pay Off, where you watch rather than play.
- **NOT a career-wiping roguelike**: we borrow draft structure and variance, not loss and resets, because resets would compromise Your Club, Your Players and Cozy Pace.
- **NOT monetized with energy timers or progress gating**: it would compromise Cozy Pace.

---

## Visual Identity Anchor

**Direction: Growing Town Diorama.** Visual rule: "Every number has a place in the town." Each stat or upgrade must change something visible on the pitch, the stands or the street.

- **Chunky, grid-based pixel town:** rounded, 3/4 top-down tiles on a strict grid; chibi 2 to 3 head-tall players with big readable silhouettes; growth shown by adding modules (second stand, floodlights, roof). *Test:* if a stat has no visible module, it is not ready.
- **Colour means state:** warm is growth and good, cool is neutral or rival, red is rare and reserved for real alerts. *Test:* red appears only for real alerts.
- **The club's own colour is the only strong accent,** so the player's team always reads first. *Test:* the player's club reads first on any screen.

**Colour philosophy:** a warm, desaturated pastel base with grass green as the anchor. The palette shifts by tier: mud brown and dull green at village level, lush green mid-ladder, saturated stadium-night blues and gold at Champions League level.

Borrowed from the other directions: tactile card framing for the draft UI (Matchday Scrapbook) and bold framing for short goal highlights only (Terrace Poster).

---

## Inspiration and References

| Reference | What We Take From It | What We Do Differently | Why It Matters |
| ---- | ---- | ---- | ---- |
| Pocket League Story | Cozy club and town growth | Adds a roguelike draft each block | Proves the cozy football management loop |
| Slay the Spire | Draft and synergy-building | Cards shape a persistent club, not a one-off run | Proves drafting is compelling in short loops |
| Super Auto Pets | Auto-played matches with build-up between rounds | Light live calls and football context | Proves watch-and-cheer satisfaction |

**Non-game inspirations**: local Saturday-morning grounds, football annuals and match-day posters.

---

## Target Player Profile

| Attribute | Detail |
| ---- | ---- |
| **Age range** | 18-45 |
| **Gaming experience** | Casual to mid-core |
| **Time availability** | 10 to 30 minute sessions, longer on weekends |
| **Platform preference** | Phone and browser |
| **Current games they play** | Pocket League Story, Game Dev Story, Slay the Spire |
| **What they're looking for** | A cozy club-growth game with a replayable strategic hook |
| **What would turn them away** | Heavy statistics, real-time controls, monetization pressure |

---

## Technical Considerations

| Consideration | Assessment |
| ---- | ---- |
| **Recommended Engine** | Undecided; `/setup-engine` decides. Technical-director requirement: the match simulation, balance harness and save migrations must run headless in Node |
| **Key Technical Challenges** | Readable deterministic match simulation; card and synergy balance; durable versioned saves; mobile rendering of a growing town |
| **Art Style** | Pixel (code-drawn) |
| **Art Pipeline Complexity** | Low to Medium (procedural, palette-swapped paper dolls, parameterised tile modules) |
| **Audio Needs** | Moderate (crowd, goal stings, light music) |
| **Networking** | None (optional cloud save through the existing Pages Function) |
| **Content Volume** | MVP about 15 cards and 20 players; Core about 60 cards (15 to 20 effect types) |
| **Procedural Systems** | Seeded player, trait and event generation; data-driven event templates |

---

## Risks and Open Questions

### Design Risks
- The draft layer may not be fun every 4 fixtures, so test it in weeks 2 to 3.
- Cozy Pace and challenge may pull against each other.

### Technical Risks
- Match simulation readability (HIGH effort, MEDIUM risk). Mitigation: abstract seeded event simulation, a renderer that never writes to state, and card tags on every highlight event.
- Card balance across 60+ cards. Mitigation: a small set of modifier rules with stacking caps and a headless Monte Carlo harness before about 30 cards.
- Save durability, including iOS storage eviction. Mitigation: `schemaVersion` with tested migrations from day one, cloud save in the MVP, `storage.persist()`.
- Mobile performance. Mitigation: cached offscreen tile modules and crowd strips.
- Feasibility verdict: TD-FEASIBILITY returned CONCERNS (no blockers).

### Market Risks
- Direct overlap with Pocket League Story, answered by the draft hook.

### Scope Risks
- Scope verdict: PR-SCOPE returned OPTIMISTIC, and the adjustments were applied (4-month MVP, cumulative timeline, Career tier, Core ending, legends first to cut).
- Dense manager UI on a phone is often more work than the simulation.

### Open Questions
- Is the draft fun every block? Answer with a `/prototype` in the first weeks.
- What engine, if any? `/setup-engine`.

---

## MVP Definition

**Core hypothesis**: Drafting a card before each block of fixtures and watching the result in a short highlight is fun on its own, even before the town and long-term career exist.

**Required for MVP** (budget 4 months; draft tested in weeks 2 to 3):
1. A deterministic seeded match simulation shown as a highlight with 2 live calls.
2. About 15 draft cards on a small set of modifier rules.
3. One village-league season with about 20 players.
4. A basic town: pitch, one stand and 1 to 3 facilities, one visual stage.
5. Versioned save with cloud backup, and a phone-friendly layout proven in month 1.

**Explicitly NOT in MVP**:
- Multiple league tiers, promotion and relegation.
- Staff, transfers, aging and legends.
- Events and town growth stages beyond the first.

### Scope Tiers (cumulative from day one)

| Tier | Content | Features | Timeline |
| ---- | ---- | ---- | ---- |
| **MVP** | One village-league season | Draft, match highlights, basic town, save | 4 months |
| **Career** | Multi-season play, tier 2 | Promotion, aging, about 30 cards, transfers | month 6-7 |
| **Core (launch target)** | 3 league tiers with an ending (win tier 3, then New Game+) | About 60 cards, staff, traits (legends is the first cut) | month 9-11 |
| **Full Vision** | All tiers to the Champions League | 100+ cards, events, big-stadium growth stages, polish | up to month 20, post-launch updates |

---

## Next Steps

- [ ] `/setup-engine`: configure the engine (headless-Node requirement)
- [ ] `/art-bible`: lock the palette per tier, tile grid size and paper-doll part count
- [ ] `/design-review design/gdd/game-concept.md`
- [ ] `/prototype`: test the draft + match loop first
- [ ] `/map-systems`, then `/design-system` once per system
- [ ] `/create-architecture`, `/architecture-decision`, `/architecture-review`
- [ ] `/gate-check` before Production
