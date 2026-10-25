class_name PsClub
extends RefCounted
## All the game rules outside a single match: league, fixtures, money, facilities,
## the card draft and the season roll-over. State is one JSON-friendly Dictionary;
## every function here takes it as `st` and changes it in place.
## Randomness always comes from a PsRng seeded from st.seed, never from the engine.

const SCHEMA: int = 2
const TEAMS: int = 8
const MATCHDAYS: int = 14
const BLOCK_STARTS: Array = [0, 4, 8, 11]      # a draft before each block of fixtures
const FACILITIES: Array = ["stand", "lights", "training", "academy"]
const FAC_MAX: int = 4
const FAC_COST: Dictionary = {
	"stand": [600, 1200, 2400, 4800],
	"lights": [400, 800, 1600, 3200],
	"training": [500, 1000, 2000, 4000],
	"academy": [400, 800, 1600, 3200],
}
const FAC_NAME: Dictionary = {
	"stand": "Stand", "lights": "Floodlights", "training": "Training ground", "academy": "Youth academy",
}
const FAC_DESC: Dictionary = {
	"stand": "More seats, more gate money, more fans in the stands.",
	"lights": "Evening matches: bigger gate, and a roaring crowd lifts your attack at home.",
	"training": "After every match day a few players improve. Stronger growth each season.",
	"academy": "Every season new youngsters join the squad, with a chance of a Prodigy.",
}
const STAND_CAPACITY: Array = [200, 350, 600, 1000, 1600]
const TICKET: int = 1
const WAGES_PER_DAY: int = 70
const CLUB_NAMES: Array = [
	"Dorpstraat United", "Rovers Zuid", "Sporting Kleinstad", "Olympia Polder",
	"Racing Bosrand", "Voorwaarts Mol", "Atletico Kerkhof", "FC Wijngaard",
	"Union Havenwijk", "Spartak Weide", "KFC Molenberg", "Athletic Dijk",
]
const COLORS: Array = [
	[Color("e8553d"), Color("fff4e0")],   # red / cream
	[Color("3d7be8"), Color("fff4e0")],   # blue / cream
	[Color("2fa86a"), Color("fff4e0")],   # green / cream
	[Color("f2c23a"), Color("2b2b3a")],   # yellow / ink
	[Color("e8873d"), Color("2b2b3a")],   # orange / ink
	[Color("9a5be0"), Color("fff4e0")],   # purple / cream
]

# ---------------------------------------------------------------- new game

static func new_game(seed_value: int, club_name: String, color_idx: int) -> Dictionary:
	var rng: PsRng = PsRng.new(PsRng.mix(seed_value, 1))
	var squad: Array = PsPlayers.make_squad(rng, 55)
	var st: Dictionary = {
		"schema_version": SCHEMA,
		"seed": seed_value & 0xFFFFFFFF,
		"club": {"name": club_name, "color": color_idx, "money": 350, "fans": 120},
		"facilities": {"stand": 0, "lights": 0, "training": 0, "academy": 0},
		"squad": squad,
		"next_pid": squad.size() + 1,
		"formation": PsFormations.DEFAULT,
		"mentality": "balanced",
		"lineup": PsPlayers.auto_lineup(squad),
		"cards": [],
		"legacy": "",
		"offer": [],
		"offer_n": 0,
		"seasons_done": 0,
		"titles": 0,
		"legends": [],
		"last_match": {},
		"season": {},
	}
	start_season(st, 1)
	return st

static func start_season(st: Dictionary, no: int) -> void:
	var rng: PsRng = PsRng.new(PsRng.mix(int(st["seed"]), 100 + no))
	var names: Array = CLUB_NAMES.duplicate()
	# Rivals: spread of strength around the league level of this season.
	var league_base: int = 52 + (no - 1) * 2
	var teams: Array = [{"name": st["club"]["name"], "base": 0, "me": true, "formation": str(st.get("formation", PsFormations.DEFAULT))}]
	var pool: Array = names.duplicate()
	for i in range(1, TEAMS):
		var nm: String = str(pool.pop_at(rng.below(pool.size())))
		teams.append({"name": nm, "base": league_base + rng.between(-5, 9), "me": false,
			"formation": str(rng.pick(PsFormations.LIST))})
	var table: Array = []
	for i in TEAMS:
		table.append({"idx": i, "name": teams[i]["name"], "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0})
	st["season"] = {
		"no": no, "day": 0, "teams": teams, "fixtures": make_fixtures(),
		"table": table, "results": [], "done": false,
	}
	st["cards"] = []
	if str(st["legacy"]) != "":
		st["cards"].append(st["legacy"])
	st["offer"] = []
	st["offer_n"] = 0
	_open_draft_if_due(st)

## Double round-robin by the circle method: 14 match days of 4 fixtures [home, away].
static func make_fixtures() -> Array:
	var ids: Array = []
	for i in TEAMS:
		ids.append(i)
	var rounds: Array = []
	for r in TEAMS - 1:
		var day: Array = []
		for k in TEAMS / 2:
			var a: int = int(ids[k])
			var b: int = int(ids[TEAMS - 1 - k])
			day.append([a, b] if (r + k) % 2 == 0 else [b, a])
		rounds.append(day)
		var last: int = int(ids.pop_back())
		ids.insert(1, last)
	var second: Array = []
	for day in rounds:
		var flipped: Array = []
		for f in day:
			flipped.append([f[1], f[0]])
		second.append(flipped)
	return rounds + second

# ---------------------------------------------------------------- queries

static func facility(st: Dictionary, f: String) -> int:
	return int(st["facilities"][f])

static func club_level(st: Dictionary) -> int:
	var sum: int = 0
	for f in FACILITIES:
		sum += facility(st, f)
	return 1 + sum

static func stadium_capacity(st: Dictionary) -> int:
	return int(STAND_CAPACITY[facility(st, "stand")])

static func attendance(st: Dictionary) -> int:
	return mini(stadium_capacity(st), int(st["club"]["fans"]))

static func is_season_over(st: Dictionary) -> bool:
	return int(st["season"]["day"]) >= MATCHDAYS

static func block_of_day(day: int) -> int:
	var b: int = 0
	for i in BLOCK_STARTS.size():
		if day >= int(BLOCK_STARTS[i]):
			b = i
	return b

static func block_size(block: int) -> int:
	var start: int = int(BLOCK_STARTS[block])
	var end: int = MATCHDAYS if block + 1 >= BLOCK_STARTS.size() else int(BLOCK_STARTS[block + 1])
	return end - start

static func draft_pending(st: Dictionary) -> bool:
	return not st["offer"].is_empty()

## My fixture today: {"home": idx, "away": idx, "me_home": bool, "opp": idx}
static func my_fixture(st: Dictionary) -> Dictionary:
	var s: Dictionary = st["season"]
	if is_season_over(st):
		return {}
	var day: Array = s["fixtures"][int(s["day"])]
	for f in day:
		if int(f[0]) == 0 or int(f[1]) == 0:
			return {"home": int(f[0]), "away": int(f[1]), "me_home": int(f[0]) == 0,
				"opp": int(f[1]) if int(f[0]) == 0 else int(f[0])}
	return {}

static func team_squad(st: Dictionary, idx: int) -> Array:
	if idx == 0:
		return st["squad"]
	var s: Dictionary = st["season"]
	var rng: PsRng = PsRng.new(PsRng.mix(int(st["seed"]), 1000 * int(s["no"]) + idx))
	return PsPlayers.make_squad(rng, int(s["teams"][idx]["base"]), 1000 * idx)

static func team_cfg(st: Dictionary, idx: int, at_home: bool = false) -> Dictionary:
	var s: Dictionary = st["season"]
	var squad: Array = team_squad(st, idx)
	if idx == 0:
		var formation: String = my_formation(st)
		var lineup: Dictionary = PsPlayers.fix_lineup(squad, st["lineup"], formation)
		var xi: Array = PsPlayers.lineup_players(squad, lineup)
		var ids: Array = []
		for p in xi:
			ids.append(int(p["id"]))
		# Floodlights: a roaring home crowd lifts the attack by 1 per level.
		var bonus: Dictionary = {"atk": facility(st, "lights") if at_home else 0}
		return {"name": s["teams"][0]["name"], "xi": xi, "bench": PsPlayers.bench_players(squad, ids),
			"cards": st["cards"].duplicate(), "bonus": bonus, "formation": formation,
			"mentality": str(st.get("mentality", "balanced")), "ai": false}
	var f: String = str(s["teams"][idx].get("formation", PsFormations.DEFAULT))
	var best: Dictionary = PsPlayers.auto_lineup(squad, f)
	var oxi: Array = PsPlayers.lineup_players(squad, best)
	var oids: Array = []
	for p in oxi:
		oids.append(int(p["id"]))
	return {"name": s["teams"][idx]["name"], "xi": oxi, "bench": PsPlayers.bench_players(squad, oids),
		"cards": [], "formation": f, "mentality": "balanced", "ai": true}

static func my_formation(st: Dictionary) -> String:
	var f: String = str(st.get("formation", PsFormations.DEFAULT))
	return f if PsFormations.valid(f) else PsFormations.DEFAULT

## Change formation; the XI is rebuilt for it, keeping players that still fit.
static func set_formation(st: Dictionary, f: String) -> bool:
	if not PsFormations.valid(f):
		return false
	st["formation"] = f
	st["lineup"] = PsPlayers.fix_lineup(st["squad"], st["lineup"], f)
	if st["season"].has("teams"):
		st["season"]["teams"][0]["formation"] = f
	return true

static func match_seed(st: Dictionary) -> int:
	var s: Dictionary = st["season"]
	return PsRng.mix(int(st["seed"]), 50000 + int(s["no"]) * 100 + int(s["day"]))

static func table_sorted(st: Dictionary) -> Array:
	var rows: Array = st["season"]["table"].duplicate(true)
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a["pts"]) != int(b["pts"]):
			return int(a["pts"]) > int(b["pts"])
		var ga: int = int(a["gf"]) - int(a["ga"])
		var gb: int = int(b["gf"]) - int(b["ga"])
		if ga != gb:
			return ga > gb
		if int(a["gf"]) != int(b["gf"]):
			return int(a["gf"]) > int(b["gf"])
		return int(a["idx"]) < int(b["idx"]))
	return rows

static func position(st: Dictionary) -> int:
	var rows: Array = table_sorted(st)
	for i in rows.size():
		if int(rows[i]["idx"]) == 0:
			return i + 1
	return TEAMS

# ---------------------------------------------------------------- draft

static func _open_draft_if_due(st: Dictionary) -> void:
	var day: int = int(st["season"]["day"])
	if day >= MATCHDAYS or not BLOCK_STARTS.has(day):
		return
	var rng: PsRng = PsRng.new(PsRng.mix(int(st["seed"]), 70000 + int(st["season"]["no"]) * 10 + block_of_day(day)))
	st["offer"] = PsCards.draw_offer(rng, club_level(st), st["cards"])
	st["offer_n"] = int(st["offer_n"]) + 1

static func pick_card(st: Dictionary, card_id: String) -> bool:
	if not st["offer"].has(card_id):
		return false
	st["cards"].append(card_id)
	st["offer"] = []
	return true

# ---------------------------------------------------------------- facilities

static func upgrade_cost(st: Dictionary, f: String) -> int:
	var lvl: int = facility(st, f)
	if lvl >= FAC_MAX:
		return -1
	return int(FAC_COST[f][lvl])

static func can_upgrade(st: Dictionary, f: String) -> bool:
	var c: int = upgrade_cost(st, f)
	return c > 0 and int(st["club"]["money"]) >= c

static func upgrade(st: Dictionary, f: String) -> bool:
	if not can_upgrade(st, f):
		return false
	st["club"]["money"] = int(st["club"]["money"]) - upgrade_cost(st, f)
	st["facilities"][f] = facility(st, f) + 1
	return true

# ---------------------------------------------------------------- playing a match day

## Record my finished match and play the other fixtures. `sim` is my PsMatchSim.
## Returns a summary dictionary for the UI.
static func finish_matchday(st: Dictionary, sim: PsMatchSim) -> Dictionary:
	var s: Dictionary = st["season"]
	var day: int = int(s["day"])
	var fx: Dictionary = my_fixture(st)
	var res: Dictionary = sim.result()
	var my_goals: int = int(res["home"]) if fx["me_home"] else int(res["away"])
	var opp_goals: int = int(res["away"]) if fx["me_home"] else int(res["home"])
	_record(st, int(fx["home"]), int(fx["away"]), int(res["home"]), int(res["away"]))
	var others: Array = []
	var seed_base: int = match_seed(st)
	var n: int = 0
	for f in s["fixtures"][day]:
		if int(f[0]) == 0 or int(f[1]) == 0:
			continue
		n += 1
		var m: PsMatchSim = PsMatchSim.simulate(PsRng.mix(seed_base, n), team_cfg(st, int(f[0])), team_cfg(st, int(f[1])))
		var r: Dictionary = m.result()
		_record(st, int(f[0]), int(f[1]), int(r["home"]), int(r["away"]))
		others.append({"home": s["teams"][int(f[0])]["name"], "away": s["teams"][int(f[1])]["name"],
			"hg": int(r["home"]), "ag": int(r["away"])})
	# Player stats
	var my_side: String = "home" if fx["me_home"] else "away"
	# Everyone who played, starters and substitutes, gets an appearance.
	for p in st["squad"]:
		if sim.pstats.has("%s:%d" % [my_side, int(p["id"])]):
			p["apps"] = int(p["apps"]) + 1
	for sc in res["scorers"]:
		if sc["side"] == my_side:
			var pl: Dictionary = PsPlayers.by_id(st["squad"], int(sc["pid"]))
			if not pl.is_empty():
				pl["goals"] = int(pl["goals"]) + 1
	# Money
	var outcome: String = "win" if my_goals > opp_goals else ("draw" if my_goals == opp_goals else "loss")
	var income: int = 0
	var gate: int = 0
	if fx["me_home"]:
		gate = attendance(st) * TICKET
		gate += gate * facility(st, "lights") * 15 / 100
		income += gate
	var bonus: int = 80 if outcome == "win" else (25 if outcome == "draw" else 0)
	income += bonus
	var wages: int = WAGES_PER_DAY + club_level(st) * 6 + facility(st, "training") * 4
	st["club"]["money"] = int(st["club"]["money"]) + income - wages
	# Fans follow results
	var fans: int = int(st["club"]["fans"])
	var delta: int = 0
	match outcome:
		"win": delta = maxi(3, fans * 6 / 100)
		"draw": delta = maxi(1, fans * 1 / 100)
		_: delta = -maxi(1, fans * 2 / 100)
	st["club"]["fans"] = clampi(fans + delta, 60, 4000)
	# Training
	var grown: Array = _train(st, day)
	var summary: Dictionary = {
		"day": day + 1, "outcome": outcome, "my_goals": my_goals, "opp_goals": opp_goals,
		"opp": s["teams"][int(fx["opp"])]["name"], "home": fx["me_home"],
		"income": income, "wages": wages, "gate": gate, "bonus": bonus,
		"others": others, "grown": grown, "scorers": res["scorers"],
		"stats": res["stats"], "possession_home": res["possession_home"], "mom": res["mom"],
		"ratings": sim.ratings(), "my_side": my_side,
	}
	s["results"].append({"day": day + 1, "opp": summary["opp"], "home": fx["me_home"], "mg": my_goals, "og": opp_goals})
	st["last_match"] = summary
	s["day"] = day + 1
	if is_season_over(st):
		s["done"] = true
	else:
		_open_draft_if_due(st)
	return summary

static func _record(st: Dictionary, h: int, a: int, hg: int, ag: int) -> void:
	var t: Array = st["season"]["table"]
	var th: Dictionary = t[h]
	var ta: Dictionary = t[a]
	th["p"] += 1
	ta["p"] += 1
	th["gf"] += hg
	th["ga"] += ag
	ta["gf"] += ag
	ta["ga"] += hg
	if hg > ag:
		th["w"] += 1
		th["pts"] += 3
		ta["l"] += 1
	elif hg < ag:
		ta["w"] += 1
		ta["pts"] += 3
		th["l"] += 1
	else:
		th["d"] += 1
		ta["d"] += 1
		th["pts"] += 1
		ta["pts"] += 1

## Training ground: after each match day `level` players gain a point in their main stat.
static func _train(st: Dictionary, day: int) -> Array:
	var lvl: int = facility(st, "training")
	var grown: Array = []
	if lvl <= 0:
		return grown
	var rng: PsRng = PsRng.new(PsRng.mix(int(st["seed"]), 90000 + int(st["season"]["no"]) * 100 + day))
	for i in lvl:
		var p: Dictionary = rng.pick(st["squad"])
		var key: String = "att"
		match str(p["pos"]):
			"GK", "DEF": key = "def"
			"MID": key = "tmp"
		if int(p[key]) < 95:
			p[key] = int(p[key]) + 1
			grown.append({"name": p["name"], "stat": key})
	return grown

# ---------------------------------------------------------------- season end

static func season_prize(st: Dictionary) -> int:
	var pos: int = position(st)
	return maxi(0, (TEAMS + 1 - pos) * 60) + (400 if pos == 1 else 0)

## Close the season (prize money, titles) and roll to the next one.
## Returns {"pos", "champion", "prize", "retired": [names], "joined": [names]}.
static func end_season(st: Dictionary, keep_card: String) -> Dictionary:
	var s: Dictionary = st["season"]
	var pos: int = position(st)
	var prize: int = season_prize(st)
	st["club"]["money"] = int(st["club"]["money"]) + prize
	var champion: bool = pos == 1
	if champion:
		st["titles"] = int(st["titles"]) + 1
		st["club"]["fans"] = int(st["club"]["fans"]) * 125 / 100
	st["seasons_done"] = int(st["seasons_done"]) + 1
	st["legacy"] = keep_card if st["cards"].has(keep_card) else ""
	var no: int = int(s["no"])
	var rng: PsRng = PsRng.new(PsRng.mix(int(st["seed"]), 120000 + no))
	PsPlayers.age_squad(rng, st["squad"], facility(st, "training"))
	var retired: Array = []
	var keep: Array = []
	for p in st["squad"]:
		if p.get("retire", false):
			retired.append(p["name"])
			if PsPlayers.is_legend_candidate(p):
				st["legends"].append({"name": p["name"], "pos": p["pos"], "goals": p["goals"], "apps": p["apps"], "season": no})
		else:
			keep.append(p)
	st["squad"] = keep
	var joined: Array = _refill_squad(st, rng)
	st["lineup"] = PsPlayers.fix_lineup(st["squad"], st["lineup"], my_formation(st))
	start_season(st, no + 1)
	return {"pos": pos, "champion": champion, "prize": prize, "retired": retired, "joined": joined}

## Top the squad back up to 2/6/7/5 with youngsters; the academy adds extras.
static func _refill_squad(st: Dictionary, rng: PsRng) -> Array:
	var joined: Array = []
	var counts: Dictionary = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
	for p in st["squad"]:
		counts[p["pos"]] += 1
	var academy: int = facility(st, "academy")
	for pos in PsPlayers.POS_ORDER:
		var need: int = int(PsPlayers.POS_COUNT[pos]) - int(counts[pos])
		for i in maxi(0, need):
			joined.append(_new_youth(st, rng, pos, academy))
	# Academy bonus youngsters (beyond filling holes), one per level at random positions.
	for i in academy:
		joined.append(_new_youth(st, rng, str(rng.pick(["DEF", "MID", "MID", "FWD"])), academy))
	return joined

static func _new_youth(st: Dictionary, rng: PsRng, pos: String, academy: int) -> String:
	var p: Dictionary = PsPlayers.make_player(rng, int(st["next_pid"]), pos, 48 + academy * 2)
	st["next_pid"] = int(st["next_pid"]) + 1
	p["age"] = rng.between(16, 18)
	if academy > 0 and rng.chance(150 + academy * 100):
		p["trait"] = "prodigy"
	st["squad"].append(p)
	return str(p["name"])

## Squads above 20 are fine, but the bench is capped so lists stay readable.
static func squad_sorted(st: Dictionary) -> Array:
	var out: Array = st["squad"].duplicate()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var pa: int = PsPlayers.POS_ORDER.find(a["pos"])
		var pb: int = PsPlayers.POS_ORDER.find(b["pos"])
		if pa != pb:
			return pa < pb
		return PsPlayers.overall(a) > PsPlayers.overall(b))
	return out
