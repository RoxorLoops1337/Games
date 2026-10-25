class_name PsMatchSim
extends RefCounted
## Abstract football match. A pure function of (seed, both teams, cards, live calls).
## It only produces an event log; drawing the match never feeds back in here.
## One minute per step(), one seeded PsRng, integer maths only.

const MINUTES: int = 90
const ATTACK_RATE: int = 235          # per mille chance of an attack in a minute
const CALLS_PER_MATCH: int = 2

const CALL_LABEL: Dictionary = {
	"push": "Push forward",
	"bus": "Park the bus",
	"legs": "Fresh legs",
}
const CALL_DESC: Dictionary = {
	"push": "Attack +6, defence -5 for the rest of the match.",
	"bus": "Defence +7, attack -5 for the rest of the match.",
	"legs": "Substitutions: tired legs come off, tempo +2.",
}

var rng: PsRng
var minute: int = 0
var finished: bool = false
var goals: Dictionary = {"home": 0, "away": 0}
var shots: Dictionary = {"home": 0, "away": 0}
var sides: Dictionary = {}
var events: Array = []
var scorers: Array = []     # [{side, pid, name, min}]

## cfg: {"name": String, "xi": Array of players, "cards": Array of ids}
static func create(seed_value: int, home_cfg: Dictionary, away_cfg: Dictionary) -> PsMatchSim:
	var m: PsMatchSim = PsMatchSim.new()
	m.rng = PsRng.new(seed_value)
	m.sides["home"] = m._make_side(home_cfg, true)
	m.sides["away"] = m._make_side(away_cfg, false)
	return m

## Run a whole match. `calls` is [{"min": 35, "side": "home", "id": "push"}].
static func simulate(seed_value: int, home_cfg: Dictionary, away_cfg: Dictionary, calls: Array = []) -> PsMatchSim:
	var m: PsMatchSim = create(seed_value, home_cfg, away_cfg)
	while not m.finished:
		for c in calls:
			if int(c["min"]) == m.minute + 1:
				m.apply_call(str(c["side"]), str(c["id"]))
		m.step()
	return m

static func team_base(xi: Array) -> Dictionary:
	var sum: Dictionary = {}
	var cnt: Dictionary = {}
	for pos in PsPlayers.POS_ORDER:
		sum[pos] = {"att": 0, "def": 0, "tmp": 0, "sta": 0}
		cnt[pos] = 0
	var sta_total: int = 0
	var wingers: int = 0
	var young: int = 0
	var old: int = 0
	var traits: Dictionary = {}
	for p in xi:
		var pos: String = str(p["pos"])
		for k in ["att", "def", "tmp", "sta"]:
			sum[pos][k] += int(p[k])
		cnt[pos] += 1
		sta_total += int(p["sta"])
		var tr: String = str(p.get("trait", ""))
		if tr != "":
			traits[tr] = int(traits.get(tr, 0)) + 1
		if tr == "winger":
			wingers += 1
		if int(p["age"]) <= 21:
			young += 1
		if int(p["age"]) >= 30:
			old += 1
	var av: Callable = func(pos: String, k: String) -> int:
		return int(sum[pos][k]) / maxi(1, int(cnt[pos]))
	var atk: int = (av.call("FWD", "att") * 550 + av.call("MID", "att") * 300 + av.call("DEF", "att") * 150) / 1000
	var def: int = (av.call("GK", "def") * 250 + av.call("DEF", "def") * 450 + av.call("MID", "def") * 300) / 1000
	def += 0
	var tmp: int = (av.call("MID", "tmp") * 600 + av.call("FWD", "tmp") * 200 + av.call("DEF", "tmp") * 200) / 1000
	var sta: int = sta_total / maxi(1, xi.size())
	# Traits that work on their own, without a card.
	atk += mini(2, int(traits.get("poacher", 0)))
	def += mini(2, int(traits.get("wall", 0)))
	tmp += mini(2, int(traits.get("playmaker", 0)))
	sta += mini(3, int(traits.get("engine", 0)) * 2)
	return {"atk": atk, "def": def, "tmp": tmp, "sta": sta,
		"winger": wingers, "young": young, "old": old, "traits": traits}

func _make_side(cfg: Dictionary, is_home: bool) -> Dictionary:
	var base: Dictionary = team_base(cfg["xi"])
	return {
		"name": str(cfg["name"]),
		"xi": cfg["xi"],
		"cards": cfg.get("cards", []),
		"home": is_home,
		"base": base,
		"power": (int(base["atk"]) + int(base["def"]) + int(base["tmp"])) / 3,
		"call": {"atk": 0, "def": 0, "tmp": 0, "sta": 0},
		"bonus": cfg.get("bonus", {}),
		"fresh": 0,
		"calls_left": CALLS_PER_MATCH,
	}

func _other(side: String) -> String:
	return "away" if side == "home" else "home"

## Channels of one side right now, with the card that helps most per channel.
func effective(side: String) -> Dictionary:
	var s: Dictionary = sides[side]
	var o: Dictionary = sides[_other(side)]
	var b: Dictionary = s["base"]
	var ctx: Dictionary = {
		"minute": maxi(minute, 1), "my_goals": goals[side], "opp_goals": goals[_other(side)],
		"home": s["home"], "my_power": s["power"], "opp_power": o["power"],
		"winger": b["winger"], "young": b["young"], "old": b["old"], "traits": b["traits"],
	}
	var ev: Dictionary = PsCards.evaluate(s["cards"], ctx)
	var mods: Dictionary = ev["mods"]
	var call: Dictionary = s["call"]
	var bonus: Dictionary = s["bonus"]
	var sta: int = int(b["sta"]) + int(mods["sta"]) + int(call["sta"])
	var tired: int = maxi(0, minute - 55 - int(s["fresh"]))
	var fatigue: int = tired * maxi(0, 80 - sta) / 150
	return {
		"atk": int(b["atk"]) + int(mods["atk"]) + int(call["atk"]) + int(bonus.get("atk", 0)) - fatigue,
		"def": int(b["def"]) + int(mods["def"]) + int(call["def"]) + int(bonus.get("def", 0)),
		"tmp": int(b["tmp"]) + int(mods["tmp"]) + int(call["tmp"]) + int(bonus.get("tmp", 0)) - fatigue,
		"sta": sta,
		"tag": ev["tag"],
	}

func calls_left(side: String) -> int:
	return int(sides[side]["calls_left"])

func apply_call(side: String, id: String) -> bool:
	var s: Dictionary = sides[side]
	if int(s["calls_left"]) <= 0 or finished:
		return false
	var c: Dictionary = s["call"]
	match id:
		"push":
			c["atk"] += 6
			c["def"] -= 5
		"bus":
			c["def"] += 7
			c["atk"] -= 5
		"legs":
			s["fresh"] = 20
			c["tmp"] += 2
		_:
			return false
	s["calls_left"] = int(s["calls_left"]) - 1
	_add({"min": minute, "side": side, "type": "call", "call": id, "player": "", "pid": 0, "tag": ""})
	return true

func _add(ev: Dictionary) -> void:
	ev["score"] = [goals["home"], goals["away"]]
	events.append(ev)

func _pick_shooter(side: String) -> Dictionary:
	var xi: Array = sides[side]["xi"]
	var pool: Array = []
	var weights: Array = []
	for p in xi:
		if p["pos"] == "GK":
			continue
		var w: int = maxi(1, int(p["att"]) - 20)
		match str(p["pos"]):
			"FWD": w *= 6
			"MID": w *= 3
		if p.get("trait", "") == "poacher":
			w += 40
		pool.append(p)
		weights.append(w)
	return pool[rng.weighted(weights)]

## Advance one minute. Returns the events that happened in it.
func step() -> Array:
	if finished:
		return []
	minute += 1
	var first: int = events.size()
	var eh: Dictionary = effective("home")
	var ea: Dictionary = effective("away")
	var p_home: int = clampi(500 + (int(eh["tmp"]) - int(ea["tmp"])) * 10, 250, 750)
	var att_side: String = "home" if rng.below(1000) < p_home else "away"
	var def_side: String = _other(att_side)
	var ea_att: Dictionary = eh if att_side == "home" else ea
	var ea_def: Dictionary = ea if att_side == "home" else eh
	if rng.below(1000) < ATTACK_RATE:
		_attack(att_side, def_side, ea_att, ea_def)
	if minute == 45:
		_add({"min": minute, "side": "", "type": "halftime", "player": "", "pid": 0, "tag": ""})
	if minute >= MINUTES:
		finished = true
		_add({"min": minute, "side": "", "type": "fulltime", "player": "", "pid": 0, "tag": ""})
	return events.slice(first)

func _attack(att_side: String, def_side: String, e_att: Dictionary, e_def: Dictionary) -> void:
	var edge: int = int(e_att["atk"]) - int(e_def["def"])
	var shooter: Dictionary = _pick_shooter(att_side)
	var tag_att: String = str(e_att["tag"]["atk"])
	var tag_def: String = str(e_def["tag"]["def"])
	var gk_name: String = ""
	for p in sides[def_side]["xi"]:
		if p["pos"] == "GK":
			gk_name = str(p["name"])
	var base_ev: Dictionary = {"min": minute, "side": att_side, "player": shooter["name"], "pid": shooter["id"], "gk": gk_name}
	if rng.below(1000) < clampi(250 - edge * 5, 110, 420):
		var ev: Dictionary = base_ev.duplicate()
		ev["type"] = "block"
		ev["tag"] = tag_def
		_add(ev)
		return
	shots[att_side] += 1
	if rng.below(1000) < 240:
		var ev2: Dictionary = base_ev.duplicate()
		ev2["type"] = "miss"
		ev2["tag"] = ""
		_add(ev2)
		return
	var shooter_bonus: int = (int(shooter["att"]) - 60) / 3
	var p_goal: int = clampi(245 + edge * 6 + shooter_bonus, 90, 500)
	if rng.below(1000) < p_goal:
		goals[att_side] += 1
		scorers.append({"side": att_side, "pid": shooter["id"], "name": shooter["name"], "min": minute})
		var ev3: Dictionary = base_ev.duplicate()
		ev3["type"] = "goal"
		ev3["tag"] = tag_att
		_add(ev3)
	else:
		var ev4: Dictionary = base_ev.duplicate()
		ev4["type"] = "save"
		ev4["tag"] = tag_def
		_add(ev4)

func result() -> Dictionary:
	return {"home": goals["home"], "away": goals["away"], "scorers": scorers.duplicate(true),
		"shots_home": shots["home"], "shots_away": shots["away"]}
