class_name PsMatchSim
extends RefCounted
## A football match played action by action. A pure function of (seed, both teams, cards and
## the decisions you make); it only produces an event log, drawing it never feeds back in here.
##
## The ball is always with one side, in one of four zones (0 = own box ... 3 = the other box),
## held by one player. Every action (pass, dribble, cross, shot...) is rolled from that player's
## skills, his energy and the two teams' channels (atk / def / tmp / sta, boosted by cards,
## formation and mentality). One seeded PsRng, integer maths, no engine randomness.
##
## step() plays one minute of match time and returns its events. Decisions (mentality,
## substitutions) are made between steps, normally at DECISION_MINUTES.

const MINUTES: int = 90
const MAX_SUBS: int = 3
const DECISION_MINUTES: Array = [30, 45, 65]
const MENTALITIES: Array = ["defend", "balanced", "attack"]
const MENTALITY_LABEL: Dictionary = {"defend": "Defend", "balanced": "Balanced", "attack": "Attack"}
const MENTALITY_DESC: Dictionary = {
	"defend": "Defence +5, attack -4. Safer passes, fewer shots.",
	"balanced": "No change.",
	"attack": "Attack +4, defence -3. More forward passes and shots, more turnovers.",
}
const MENTALITY_MOD: Dictionary = {
	"defend": {"atk": -4, "def": 5, "tmp": -1},
	"balanced": {},
	"attack": {"atk": 4, "def": -3, "tmp": 1},
}
const RED_PENALTY: Dictionary = {"atk": -5, "def": -5, "tmp": -4}
## How the DEFENDING side's mentality changes the attacker's odds (per mille): a compact side is hard to
## break down, an all-out attack leaves gaps behind it.
const SHAPE_PROGRESS: Dictionary = {"defend": -110, "balanced": 0, "attack": 45}
const SHAPE_BLOCK: Dictionary = {"defend": 80, "balanced": 0, "attack": -28}

# Action pacing, in seconds of match time.
const DUR: Dictionary = {
	"back": [6, 6], "short": [7, 8], "prog": [9, 8], "long": [11, 8], "dribble": [9, 10],
	"cross": [8, 5], "shot": [5, 5], "foul": [18, 20], "corner": [22, 10], "out": [14, 10],
	"goal": [40, 10], "offside": [16, 10],
}

var rng: PsRng
var minute: int = 0            # completed minutes
var t: int = 0                 # seconds of match time
var finished: bool = false
var goals: Dictionary = {"home": 0, "away": 0}
var sides: Dictionary = {}
var events: Array = []
var scorers: Array = []        # [{side, pid, name, min, assist}]
var poss: String = "home"
var zone: int = 1
var carrier: int = 0
var pstats: Dictionary = {}    # pid -> {name, side, pos, rating (x100), goals, assists, shots, tackles, saves, key}
var _step_events: Array = []
var _last_pass: Dictionary = {"side": "", "slot": -1, "ok_t": -999}

# ------------------------------------------------------------------ construction

## cfg: {"name", "xi": 11 players in slot order, "bench": [players], "cards": [ids],
##       "formation": "4-4-2", "mentality": "balanced", "bonus": {ch: n}, "ai": bool}
static func create(seed_value: int, home_cfg: Dictionary, away_cfg: Dictionary) -> PsMatchSim:
	var m: PsMatchSim = PsMatchSim.new()
	m.rng = PsRng.new(seed_value)
	m.sides["home"] = m._make_side(home_cfg, true)
	m.sides["away"] = m._make_side(away_cfg, false)
	m._refresh("home")
	m._refresh("away")
	m._kickoff("home")
	return m

## Run a whole match. `plan` is a list of decisions:
##   {"min": 30, "side": "home", "mentality": "attack"}  or  {"min": 65, "side": "home", "sub": [slot, bench_index]}
static func simulate(seed_value: int, home_cfg: Dictionary, away_cfg: Dictionary, plan: Array = []) -> PsMatchSim:
	var m: PsMatchSim = create(seed_value, home_cfg, away_cfg)
	while not m.finished:
		for d in plan:
			if int(d["min"]) == m.minute:
				if d.has("mentality"):
					m.set_mentality(str(d["side"]), str(d["mentality"]))
				if d.has("sub"):
					m.substitute(str(d["side"]), int(d["sub"][0]), int(d["sub"][1]))
		m.step()
	return m

static func team_base(xi: Array, formation: String = PsFormations.DEFAULT) -> Dictionary:
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
	var tmp: int = (av.call("MID", "tmp") * 600 + av.call("FWD", "tmp") * 200 + av.call("DEF", "tmp") * 200) / 1000
	var sta: int = sta_total / maxi(1, xi.size())
	# Traits that work on their own, without a card.
	atk += mini(2, int(traits.get("poacher", 0)))
	def += mini(2, int(traits.get("wall", 0)))
	tmp += mini(2, int(traits.get("playmaker", 0)))
	sta += mini(3, int(traits.get("engine", 0)) * 2)
	var fm: Dictionary = PsFormations.MOD.get(formation, {})
	atk += int(fm.get("atk", 0))
	def += int(fm.get("def", 0))
	tmp += int(fm.get("tmp", 0))
	return {"atk": atk, "def": def, "tmp": tmp, "sta": sta,
		"winger": wingers, "young": young, "old": old, "traits": traits}

func _make_side(cfg: Dictionary, is_home: bool) -> Dictionary:
	var formation: String = str(cfg.get("formation", PsFormations.DEFAULT))
	var xi: Array = cfg["xi"].duplicate()
	var base: Dictionary = team_base(xi, formation)
	var pos_xy: Array = PsFormations.positions(formation)
	var energy: Array = []
	var yellow: Array = []
	var off: Array = []
	var lanes: Array = []
	for i in xi.size():
		energy.append(1000)
		yellow.append(0)
		off.append(false)
		lanes.append(PsFormations.lane_of(float(pos_xy[i][1])))
	var s: Dictionary = {
		"name": str(cfg["name"]), "xi": xi, "bench": cfg.get("bench", []).duplicate(),
		"cards": cfg.get("cards", []), "home": is_home, "formation": formation,
		"mentality": str(cfg.get("mentality", "balanced")), "ai": bool(cfg.get("ai", true)),
		"base": base, "power": (int(base["atk"]) + int(base["def"]) + int(base["tmp"])) / 3,
		"bonus": cfg.get("bonus", {}), "energy": energy, "yellow": yellow, "off": off,
		"lanes": lanes, "subs": 0, "reds": 0, "eff": {},
		"stats": {"touches": 0, "shots": 0, "on_target": 0, "corners": 0, "fouls": 0,
			"yellows": 0, "reds": 0, "passes": 0, "passes_ok": 0, "offsides": 0},
	}
	var side_name: String = "home" if is_home else "away"
	for i in xi.size():
		_register(side_name, xi[i])
	return s

func _key(side: String, slot: int) -> String:
	return "%s:%d" % [side, int(sides[side]["xi"][slot]["id"])]

func _register(side: String, p: Dictionary) -> void:
	var id: String = "%s:%d" % [side, int(p["id"])]
	if not pstats.has(id):
		pstats[id] = {"pid": int(p["id"]), "name": str(p["name"]), "side": side, "pos": str(p["pos"]), "rating": 600,
			"goals": 0, "assists": 0, "shots": 0, "tackles": 0, "saves": 0, "key": 0, "yellow": 0, "red": false}

func _other(side: String) -> String:
	return "away" if side == "home" else "home"

# ------------------------------------------------------------------ channels and skills

## Recompute a side's channels (cards, mentality, reds, fatigue) and keep the card tags.
func _refresh(side: String) -> void:
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
	var mm: Dictionary = MENTALITY_MOD[s["mentality"]]
	var bonus: Dictionary = s["bonus"]
	var reds: int = int(s["reds"])
	var avg_energy: int = 0
	var live: int = 0
	for i in s["xi"].size():
		if not s["off"][i]:
			avg_energy += int(s["energy"][i])
			live += 1
	avg_energy = avg_energy / maxi(1, live)
	var fatigue: int = (1000 - avg_energy) / 100      # 0..~6 points when tired
	var sta: int = int(b["sta"]) + int(mods["sta"])
	s["eff"] = {
		"atk": int(b["atk"]) + int(mods["atk"]) + int(mm.get("atk", 0)) + int(bonus.get("atk", 0)) + reds * int(RED_PENALTY["atk"]) - fatigue,
		"def": int(b["def"]) + int(mods["def"]) + int(mm.get("def", 0)) + int(bonus.get("def", 0)) + reds * int(RED_PENALTY["def"]) - fatigue / 2,
		"tmp": int(b["tmp"]) + int(mods["tmp"]) + int(mm.get("tmp", 0)) + int(bonus.get("tmp", 0)) + reds * int(RED_PENALTY["tmp"]) - fatigue,
		"sta": sta,
		"tag": ev["tag"],
	}

func effective(side: String) -> Dictionary:
	return sides[side]["eff"]

## One skill of the player in a slot, after energy and traits. key: fin pas dri tak gk
func _sk(side: String, slot: int, key: String) -> int:
	var s: Dictionary = sides[side]
	var p: Dictionary = s["xi"][slot]
	var raw: int = 0
	match key:
		"fin": raw = int(p["att"]) + (4 if p.get("trait", "") == "poacher" else 0)
		"pas": raw = (int(p["tmp"]) * 3 + int(p["att"]) + int(p["def"])) / 5 + (4 if p.get("trait", "") == "playmaker" else 0)
		"dri": raw = (int(p["att"]) + int(p["tmp"])) / 2 + (4 if p.get("trait", "") == "winger" else 0)
		"tak": raw = int(p["def"]) + (4 if p.get("trait", "") == "wall" else 0)
		"gk": raw = int(p["def"]) + (4 if p.get("trait", "") == "wall" else 0)
	return raw * (860 + int(s["energy"][slot]) * 140 / 1000) / 1000

func energy_of(side: String, slot: int) -> int:
	return int(sides[side]["energy"][slot]) / 10

func calls_left(side: String) -> int:
	return MAX_SUBS - int(sides[side]["subs"])

# ------------------------------------------------------------------ decisions

func set_mentality(side: String, m: String) -> bool:
	if not MENTALITIES.has(m) or finished:
		return false
	if sides[side]["mentality"] == m:
		return true
	sides[side]["mentality"] = m
	_refresh(side)
	_emit({"type": "mentality", "side": side, "mentality": m})
	return true

## Replace the player in `slot` with bench player number `bench_index`. Same position only.
func substitute(side: String, slot: int, bench_index: int) -> bool:
	var s: Dictionary = sides[side]
	if finished or int(s["subs"]) >= MAX_SUBS or bench_index < 0 or bench_index >= s["bench"].size():
		return false
	if slot < 0 or slot >= s["xi"].size() or s["off"][slot]:
		return false
	var incoming: Dictionary = s["bench"][bench_index]
	var outgoing: Dictionary = s["xi"][slot]
	if incoming["pos"] != outgoing["pos"]:
		return false
	s["xi"][slot] = incoming
	s["bench"].remove_at(bench_index)
	s["bench"].append(outgoing)
	s["energy"][slot] = 1000
	s["subs"] = int(s["subs"]) + 1
	_register(side, incoming)
	_refresh(side)
	_emit({"type": "sub", "side": side, "slot": slot, "player": str(incoming["name"]), "q": str(outgoing["name"]),
		"pid": int(incoming["id"])})
	return true

## Slots of this side ordered most tired first (for the substitution screen).
func tired_slots(side: String) -> Array:
	var s: Dictionary = sides[side]
	var out: Array = []
	for i in s["xi"].size():
		if not s["off"][i] and s["xi"][i]["pos"] != "GK":
			out.append(i)
	out.sort_custom(func(a: int, b: int) -> bool:
		if int(s["energy"][a]) != int(s["energy"][b]):
			return int(s["energy"][a]) < int(s["energy"][b])
		return a < b)
	return out

# ------------------------------------------------------------------ the clock

func _emit(ev: Dictionary) -> void:
	ev["min"] = clampi(t / 60 + 1, 1, MINUTES)
	ev["t"] = t
	ev["score"] = [goals["home"], goals["away"]]
	ev["poss"] = poss
	events.append(ev)
	_step_events.append(ev)

func _kickoff(side: String) -> void:
	poss = side
	zone = 1
	carrier = _pick(side, {"MID": 6, "FWD": 2}, -1, -1)

## Play one minute of match time and return its events.
func step() -> Array:
	if finished:
		return []
	_step_events = []
	if minute == 0 and events.is_empty():
		_emit({"type": "kickoff", "side": "home"})
	_drain_energy()
	_ai_management()
	var target: int = (minute + 1) * 60
	while t < target and not finished:
		_action()
	minute += 1
	if minute == 45:
		_emit({"type": "halftime", "side": ""})
		_kickoff("away")
		for side in ["home", "away"]:
			for i in sides[side]["energy"].size():
				sides[side]["energy"][i] = mini(1000, int(sides[side]["energy"][i]) + 60)   # the break helps a little
	if minute >= MINUTES:
		finished = true
		_emit({"type": "fulltime", "side": ""})
	return _step_events

func _drain_energy() -> void:
	for side in ["home", "away"]:
		var s: Dictionary = sides[side]
		var push: int = 11 if s["mentality"] == "attack" else 10
		for i in s["xi"].size():
			if s["off"][i]:
				continue
			var p: Dictionary = s["xi"][i]
			var sta: int = int(p["sta"]) + (8 if p.get("trait", "") == "engine" else 0)
			var d: int = (50 + maxi(0, 70 - sta) * 10 / 8) * push / 130     # about 5 of 1000 a minute for an average player
			s["energy"][i] = maxi(80, int(s["energy"][i]) - d)
		_refresh(side)

func _ai_management() -> void:
	if not [58, 70, 80].has(minute + 1):
		return
	for side in ["home", "away"]:
		var s: Dictionary = sides[side]
		if not s["ai"]:
			continue
		var my: int = int(goals[side])
		var their: int = int(goals[_other(side)])
		if minute + 1 >= 70 and my < their and s["mentality"] != "attack":
			set_mentality(side, "attack")
		elif minute + 1 >= 70 and my > their and s["mentality"] != "defend":
			set_mentality(side, "defend")
		if int(s["subs"]) >= MAX_SUBS:
			continue
		for slot in tired_slots(side):
			if int(s["energy"][slot]) >= 520:
				break
			var pos: String = str(s["xi"][slot]["pos"])
			var idx: int = -1
			for b in s["bench"].size():
				if s["bench"][b]["pos"] == pos:
					idx = b
					break
			if idx >= 0:
				substitute(side, slot, idx)
				break

# ------------------------------------------------------------------ picking players

## Choose a live slot of `side`. weights: {pos: weight}; skill-weighted; lane bonus when lane >= 0.
func _pick(side: String, weights: Dictionary, exclude: int, lane: int) -> int:
	var s: Dictionary = sides[side]
	var slots: Array = []
	var ws: Array = []
	for i in s["xi"].size():
		if i == exclude or s["off"][i]:
			continue
		var p: Dictionary = s["xi"][i]
		var w: int = int(weights.get(str(p["pos"]), 0))
		if w <= 0:
			continue
		var q: int = maxi(8, PsPlayers.main_stat(p) - 20)
		w = w * q
		if lane >= 0 and int(s["lanes"][i]) == lane:
			w = w * 2
		slots.append(i)
		ws.append(w)
	if slots.is_empty():
		for i in s["xi"].size():
			if i != exclude and not s["off"][i]:
				slots.append(i)
				ws.append(10)
	if slots.is_empty():
		return 0
	return int(slots[rng.weighted(ws)])

func _receiver_weights(z: int) -> Dictionary:
	match z:
		0: return {"GK": 1, "DEF": 7, "MID": 3}
		1: return {"DEF": 2, "MID": 7, "FWD": 1}
		2: return {"DEF": 1, "MID": 6, "FWD": 4}
	return {"MID": 3, "FWD": 7}

## The opponent likely to challenge a player who has the ball in my zone `z`.
func _presser_weights(z: int) -> Dictionary:
	match z:
		0: return {"FWD": 6, "MID": 3, "DEF": 1}
		1: return {"FWD": 2, "MID": 6, "DEF": 2}
		2: return {"MID": 4, "DEF": 6, "FWD": 1}
	return {"DEF": 8, "MID": 2}

func _gk_slot(side: String) -> int:
	var s: Dictionary = sides[side]
	for i in s["xi"].size():
		if s["xi"][i]["pos"] == "GK" and not s["off"][i]:
			return i
	return 0

# ------------------------------------------------------------------ ratings and bookkeeping

func _rate(side: String, slot: int, delta: int) -> void:
	var id: String = _key(side, slot)
	pstats[id]["rating"] = clampi(int(pstats[id]["rating"]) + delta, 300, 1000)

func _stat(side: String, slot: int, key: String, n: int = 1) -> void:
	var id: String = _key(side, slot)
	pstats[id][key] = int(pstats[id][key]) + n

func _name(side: String, slot: int) -> String:
	if slot < 0:
		return ""
	return str(sides[side]["xi"][slot]["name"])

func _dur(kind: String) -> void:
	var d: Array = DUR[kind]
	t += int(d[0]) + rng.below(int(d[1]))

func _spend(side: String, slot: int, n: int) -> void:
	var s: Dictionary = sides[side]
	s["energy"][slot] = maxi(80, int(s["energy"][slot]) - n)

# ------------------------------------------------------------------ one action

func _choose(side: String, z: int, c: int) -> String:
	var s: Dictionary = sides[side]
	var pos: String = str(s["xi"][c]["pos"])
	var wide: bool = int(s["lanes"][c]) != 1
	var w: Dictionary = {}
	match z:
		0: w = {"back": 0, "short": 450, "prog": 330, "long": 150, "dribble": 50, "cross": 0, "shot": 0}
		1: w = {"back": 60, "short": 380, "prog": 340, "long": 70, "dribble": 120, "cross": 0, "shot": 0}
		2: w = {"back": 70, "short": 250, "prog": 250, "long": 0, "dribble": 190, "cross": 110 if wide else 30, "shot": 30}
		_: w = {"back": 100, "short": 210, "prog": 0, "long": 0, "dribble": 190, "cross": 150 if wide else 35, "shot": 230}
	var m: String = str(s["mentality"])
	if m == "attack":
		w["prog"] = int(w["prog"]) * 125 / 100
		w["shot"] = int(w["shot"]) * 130 / 100
		w["long"] = int(w["long"]) * 130 / 100
		w["back"] = int(w["back"]) * 60 / 100
	elif m == "defend":
		w["prog"] = int(w["prog"]) * 70 / 100
		w["shot"] = int(w["shot"]) * 70 / 100
		w["back"] = int(w["back"]) * 170 / 100
		w["long"] = int(w["long"]) * 60 / 100
	if pos == "GK":
		w["dribble"] = 0
		w["shot"] = 0
		w["cross"] = 0
		w["back"] = 0
	elif pos == "DEF":
		w["shot"] = int(w["shot"]) / 6
		w["dribble"] = int(w["dribble"]) / 2
	elif pos == "FWD":
		w["dribble"] = int(w["dribble"]) * 130 / 100
	var keys: Array = ["back", "short", "prog", "long", "dribble", "cross", "shot"]
	var ws: Array = []
	for k in keys:
		ws.append(int(w[k]))
	return str(keys[rng.weighted(ws)])

func _action() -> void:
	var a: String = poss
	var d: String = _other(a)
	var sa: Dictionary = sides[a]
	var ea: Dictionary = sa["eff"]
	var ed: Dictionary = sides[d]["eff"]
	sa["stats"]["touches"] += 1
	if sa["off"][carrier]:
		carrier = _pick(a, {"MID": 5, "DEF": 3, "FWD": 2}, -1, -1)
	var c: int = carrier
	var kind: String = _choose(a, zone, c)
	var pres: int = _pick(d, _presser_weights(zone), -1, int(sa["lanes"][c]))
	var tak: int = _sk(d, pres, "tak")
	var tmp_diff: int = int(ea["tmp"]) - int(ed["tmp"])
	var ad: int = int(ea["atk"]) - int(ed["def"])
	var p_ok: int = 0
	var pas: int = _sk(a, c, "pas")
	var shape: int = int(SHAPE_PROGRESS[sides[d]["mentality"]])
	match kind:
		"back": p_ok = clampi(930 + tmp_diff * 2, 800, 980)
		"short": p_ok = clampi(870 + (pas - tak) * 2 + tmp_diff * 3, 650, 960)
		"prog": p_ok = clampi(650 + (pas - tak) * 4 + tmp_diff * 3 + ad, 300, 880)
		"long": p_ok = clampi(420 + (pas - tak) * 3 + ad * 2, 180, 660)
		"cross": p_ok = clampi(480 + (pas - tak) * 3 + ad * 2, 250, 760)
		"dribble": p_ok = clampi(520 + (_sk(a, c, "dri") - tak) * 4 + ad, 220, 800)
		"shot":
			_shot_from_play(a, d, c)
			return
	if kind == "prog" or kind == "long" or kind == "cross" or kind == "dribble":
		p_ok = clampi(p_ok + shape, 140, 920)
	# A heavy challenge on the man with the ball, whatever he was about to do.
	if kind != "back" and rng.below(1000) < 38 + maxi(0, 50 - tak) / 3:
		_foul(d, pres, a, c)
		return
	_dur(kind)
	_spend(a, c, 9)
	if kind == "dribble":
		_do_dribble(a, d, c, pres, p_ok)
	elif kind == "cross":
		_do_cross(a, d, c, pres, p_ok)
	else:
		_do_pass(a, d, c, pres, kind, p_ok)
	_maybe_injury()

func _target_zone(kind: String) -> int:
	match kind:
		"back": return maxi(0, zone - 1)
		"short": return zone
		"prog": return mini(3, zone + 1)
		"long": return mini(3, zone + 2)
	return zone

func _do_pass(a: String, d: String, c: int, pres: int, kind: String, p_ok: int) -> void:
	var s: Dictionary = sides[a]
	var zt: int = _target_zone(kind)
	var to: int = _pick(a, _receiver_weights(zt), c, -1)
	s["stats"]["passes"] += 1
	var ev: Dictionary = {"type": "pass", "side": a, "kind": kind, "slot": c, "to": to, "zone": zt,
		"player": _name(a, c), "q": _name(a, to), "ok": true, "by": -1, "tag": ""}
	if rng.below(1000) < p_ok:
		# Caught offside on forward balls into the box.
		if zt == 3 and (kind == "prog" or kind == "long") and rng.below(1000) < 130:
			ev["ok"] = false
			ev["type"] = "offside"
			s["stats"]["offsides"] += 1
			_rate(a, to, -15)
			_emit(ev)
			_dur("offside")
			_turnover(d, a, 0, _gk_slot(d))
			return
		s["stats"]["passes_ok"] += 1
		_rate(a, c, 4 if kind == "prog" or kind == "long" else 1)
		ev["tag"] = str(sides[a]["eff"]["tag"]["tmp"]) if (kind == "prog" and zt == 3 and rng.below(1000) < 350) else ""
		_emit(ev)
		_spend(a, to, 3)
		_last_pass = {"side": a, "slot": c, "t": t}
		if zt == 3 and (kind == "prog" or kind == "long"):
			_stat(a, c, "key")
			_rate(a, c, 10)
		zone = zt
		carrier = to
		return
	ev["ok"] = false
	_rate(a, c, -6)
	var r: int = rng.below(1000)
	if r < 720 or kind == "back":
		ev["by"] = pres
		_rate(d, pres, 8)
		_emit(ev)
		var tz: int = 3 - (zone if kind == "short" or kind == "back" else zt)
		_turnover(d, a, tz, pres)
	else:
		_emit(ev)
		_dur("out")
		_turnover(d, a, 3 - zt, _pick(d, {"DEF": 5, "MID": 3}, -1, -1))

func _do_dribble(a: String, d: String, c: int, pres: int, p_ok: int) -> void:
	var ev: Dictionary = {"type": "dribble", "side": a, "slot": c, "to": c, "by": pres, "zone": mini(3, zone + 1),
		"player": _name(a, c), "q": _name(d, pres), "ok": true, "tag": ""}
	if rng.below(1000) < p_ok:
		_rate(a, c, 10)
		_emit(ev)
		zone = mini(3, zone + 1)
		return
	ev["ok"] = false
	_rate(a, c, -8)
	# A lost duel is sometimes a foul on the dribbler.
	if rng.below(1000) < 330:
		_foul(d, pres, a, c)
		return
	_stat(d, pres, "tackles")
	_rate(d, pres, 14)
	_emit(ev)
	_turnover(d, a, 3 - zone, pres)

func _do_cross(a: String, d: String, c: int, pres: int, p_ok: int) -> void:
	var s: Dictionary = sides[a]
	var to: int = _pick(a, {"FWD": 8, "MID": 3}, c, -1)
	s["stats"]["passes"] += 1
	var ev: Dictionary = {"type": "pass", "side": a, "kind": "cross", "slot": c, "to": to, "zone": 3,
		"player": _name(a, c), "q": _name(a, to), "ok": true, "by": -1, "tag": ""}
	if rng.below(1000) < p_ok:
		s["stats"]["passes_ok"] += 1
		_emit(ev)
		_rate(a, c, 6)
		_stat(a, c, "key")
		_last_pass = {"side": a, "slot": c, "t": t}
		zone = 3
		_header_chance(a, d, to, c)
		return
	ev["ok"] = false
	ev["by"] = pres
	_rate(a, c, -6)
	_emit(ev)
	_turnover(d, a, 1, pres)

func _turnover(new_side: String, old_side: String, new_zone: int, new_carrier: int) -> void:
	poss = new_side
	zone = clampi(new_zone, 0, 3)
	carrier = new_carrier
	if sides[new_side]["off"][carrier]:
		carrier = _pick(new_side, {"DEF": 4, "MID": 4}, -1, -1)

# ------------------------------------------------------------------ fouls, cards, set pieces

func _foul(fouler_side: String, fouler: int, victim_side: String, victim: int) -> void:
	var fs: Dictionary = sides[fouler_side]
	fs["stats"]["fouls"] += 1
	_rate(fouler_side, fouler, -10)
	_rate(victim_side, victim, 6)
	var ev: Dictionary = {"type": "foul", "side": fouler_side, "slot": fouler, "to": victim, "zone": 3 - zone,
		"player": _name(fouler_side, fouler), "q": _name(victim_side, victim), "ok": false, "card": "", "tag": ""}
	var r: int = rng.below(1000)
	if r < 5:
		ev["card"] = "red"
	elif r < 120:
		ev["card"] = "yellow"
	if ev["card"] == "yellow":
		fs["yellow"][fouler] += 1
		if int(fs["yellow"][fouler]) >= 2:
			ev["card"] = "red"
	if ev["card"] == "yellow":
		fs["stats"]["yellows"] += 1
		pstats[_key(fouler_side, fouler)]["yellow"] += 1
		_rate(fouler_side, fouler, -15)
	_emit(ev)
	_dur("foul")
	if ev["card"] == "red":
		_send_off(fouler_side, fouler)
	# Where did it happen? Zone is the victim side's attacking zone.
	var in_box: bool = zone == 3 and rng.below(1000) < 280
	poss = victim_side
	carrier = victim
	if in_box:
		_penalty(victim_side, fouler_side)
	elif zone >= 2 and rng.below(1000) < 420:
		_free_kick(victim_side, fouler_side)
	else:
		_dur("foul")

func _send_off(side: String, slot: int) -> void:
	var s: Dictionary = sides[side]
	s["off"][slot] = true
	s["reds"] = int(s["reds"]) + 1
	s["stats"]["reds"] += 1
	pstats[_key(side, slot)]["red"] = true
	_rate(side, slot, -100)
	_refresh(side)
	if carrier == slot and poss == side:
		carrier = _pick(side, {"DEF": 4, "MID": 4}, -1, -1)

func _penalty(a: String, d: String) -> void:
	var taker: int = _pick(a, {"FWD": 6, "MID": 4}, -1, -1)
	_emit({"type": "penalty", "side": a, "slot": taker, "player": _name(a, taker), "zone": 3, "ok": true, "tag": ""})
	_dur("foul")
	sides[a]["stats"]["shots"] += 1
	_stat(a, taker, "shots")
	var gk: int = _gk_slot(d)
	var p_goal: int = clampi(760 + (_sk(a, taker, "fin") - _sk(d, gk, "gk")) * 3, 600, 900)
	var ev: Dictionary = {"type": "shot", "side": a, "kind": "pen", "slot": taker, "gk": gk, "by": -1, "assist": -1,
		"player": _name(a, taker), "q": _name(d, gk), "zone": 3, "tag": "", "result": "goal"}
	if rng.below(1000) < p_goal:
		sides[a]["stats"]["on_target"] += 1
		_score(a, taker, -1, ev)
		return
	if rng.below(1000) < 500:
		ev["result"] = "save"
		sides[a]["stats"]["on_target"] += 1
		_stat(d, gk, "saves")
		_rate(d, gk, 40)
	else:
		ev["result"] = "miss"
	_rate(a, taker, -25)
	_emit(ev)
	_dur("shot")
	_turnover(d, a, 0, gk)

func _free_kick(a: String, d: String) -> void:
	var taker: int = _pick(a, {"MID": 6, "FWD": 3}, -1, -1)
	_emit({"type": "freekick", "side": a, "slot": taker, "player": _name(a, taker), "zone": 3, "ok": true, "tag": ""})
	_dur("foul")
	if rng.below(1000) < 320:
		var res: String = _take_shot(a, d, taker, "free", -1)
		_after_shot(a, d, res)
	else:
		var target: int = _pick(a, {"FWD": 7, "MID": 3, "DEF": 3}, taker, -1)
		_header_chance(a, d, target, taker)

func _corner(a: String, d: String) -> void:
	sides[a]["stats"]["corners"] += 1
	var taker: int = _pick(a, {"MID": 6, "FWD": 2}, -1, 0 if rng.below(2) == 0 else 2)
	_emit({"type": "corner", "side": a, "slot": taker, "player": _name(a, taker), "zone": 3, "ok": true, "tag": ""})
	_dur("corner")
	var target: int = _pick(a, {"FWD": 7, "DEF": 4, "MID": 2}, taker, -1)
	_header_chance(a, d, target, taker)

## A ball into the box: a header (or volley) at goal, if the defence does not clear it first.
func _header_chance(a: String, d: String, target: int, from: int) -> void:
	var aerial: int = (_sk(a, target, "fin") + _sk(a, target, "tak")) / 2
	var d_slot: int = _pick(d, {"DEF": 8, "GK": 1}, -1, -1)
	var clear: int = clampi(520 + (_sk(d, d_slot, "tak") - aerial) * 5 + (int(sides[d]["eff"]["def"]) - int(sides[a]["eff"]["atk"])) * 3, 250, 760)
	if rng.below(1000) < clear:
		_stat(d, d_slot, "tackles")
		_rate(d, d_slot, 10)
		_emit({"type": "clearance", "side": d, "slot": d_slot, "player": _name(d, d_slot), "zone": 1, "ok": true, "tag": ""})
		_dur("short")
		_turnover(d, a, 1, d_slot)
		return
	var res: String = _take_shot(a, d, target, "header", from)
	_after_shot(a, d, res)

# ------------------------------------------------------------------ shots

func _shot_from_play(a: String, d: String, c: int) -> void:
	var kind: String = "long" if zone < 3 else "foot"
	_dur("shot")
	_spend(a, c, 11)
	var res: String = _take_shot(a, d, c, kind, _recent_assist(a, c))
	_after_shot(a, d, res)

func _recent_assist(a: String, c: int) -> int:
	if _last_pass["side"] == a and int(_last_pass.get("t", -999)) >= t - 40 and int(_last_pass["slot"]) != c:
		return int(_last_pass["slot"])
	return -1

## One shot. Returns "goal", "save", "block" or "miss".
func _take_shot(a: String, d: String, shooter: int, kind: String, assist: int) -> String:
	var ea: Dictionary = sides[a]["eff"]
	var ed: Dictionary = sides[d]["eff"]
	var ad: int = int(ea["atk"]) - int(ed["def"])
	var fin: int = _sk(a, shooter, "fin")
	var gk: int = _gk_slot(d)
	sides[a]["stats"]["shots"] += 1
	_stat(a, shooter, "shots")
	var tag_a: String = str(ea["tag"]["atk"])
	var tag_d: String = str(ed["tag"]["def"])
	var ev: Dictionary = {"type": "shot", "side": a, "kind": kind, "slot": shooter, "gk": gk, "by": -1, "assist": assist,
		"player": _name(a, shooter), "q": _name(d, gk), "a": _name(a, assist), "zone": 3, "tag": "", "result": "miss"}
	var p_block: int = 0
	var p_miss: int = 0
	var p_goal: int = 0
	match kind:
		"long":
			p_block = clampi(300 - ad * 4, 150, 460)
			p_miss = clampi(560 - (fin - 50) * 3, 380, 680)
			p_goal = clampi(160 + ad * 2 + (fin - _sk(d, gk, "gk")) * 2, 55, 300)
		"header":
			p_block = clampi(160 - ad * 3, 70, 300)
			p_miss = clampi(470 - (fin - 50) * 2, 300, 600)
			p_goal = clampi(245 + ad * 3 + (fin - _sk(d, gk, "gk")) * 2, 90, 420)
		"free":
			p_block = 260
			p_miss = clampi(500 - (fin - 50) * 3, 340, 640)
			p_goal = clampi(190 + (fin - _sk(d, gk, "gk")) * 3 + ad * 2, 60, 360)
		_:
			p_block = clampi(260 - ad * 4, 120, 440)
			p_miss = clampi(430 - (fin - 50) * 3, 260, 580)
			p_goal = clampi(305 + ad * 3 + (fin - _sk(d, gk, "gk")) * 3, 110, 520)
	p_block = clampi(p_block + int(SHAPE_BLOCK[sides[d]["mentality"]]), 40, 520)
	if kind != "free" and rng.below(1000) < p_block:
		var blocker: int = _pick(d, {"DEF": 8, "MID": 2}, -1, -1)
		ev["result"] = "block"
		ev["by"] = blocker
		ev["tag"] = tag_d
		_rate(d, blocker, 12)
		_stat(d, blocker, "tackles")
		_emit(ev)
		return "block"
	if rng.below(1000) < p_miss:
		ev["result"] = "miss"
		_rate(a, shooter, -8)
		_emit(ev)
		return "miss"
	sides[a]["stats"]["on_target"] += 1
	if rng.below(1000) < p_goal:
		ev["tag"] = tag_a
		_score(a, shooter, assist, ev)
		return "goal"
	ev["result"] = "save"
	ev["tag"] = tag_d
	_stat(d, gk, "saves")
	_rate(d, gk, 22)
	_rate(a, shooter, 4)
	_emit(ev)
	return "save"

func _score(a: String, shooter: int, assist: int, ev: Dictionary) -> void:
	goals[a] += 1
	ev["result"] = "goal"
	ev["assist"] = assist
	ev["a"] = _name(a, assist)
	_stat(a, shooter, "goals")
	_rate(a, shooter, 90)
	var d: String = _other(a)
	if assist >= 0:
		_stat(a, assist, "assists")
		_rate(a, assist, 55)
	for i in sides[d]["xi"].size():
		if not sides[d]["off"][i]:
			var pos: String = str(sides[d]["xi"][i]["pos"])
			_rate(d, i, -25 if pos == "GK" else (-12 if pos == "DEF" else -4))
	scorers.append({"side": a, "pid": int(sides[a]["xi"][shooter]["id"]), "name": _name(a, shooter), "min": clampi(t / 60 + 1, 1, MINUTES), "assist": _name(a, assist)})
	_emit(ev)
	_refresh("home")
	_refresh("away")
	_dur("goal")
	_kickoff(d)

func _after_shot(a: String, d: String, res: String) -> void:
	if res == "goal":
		return
	var gk: int = _gk_slot(d)
	match res:
		"block":
			if rng.below(1000) < 360:
				_corner(a, d)
			else:
				_dur("short")
				_turnover(d, a, 1, _pick(d, {"DEF": 5, "MID": 3}, -1, -1))
		"save":
			if rng.below(1000) < 330:
				_corner(a, d)
			elif rng.below(1000) < 110:
				# A rebound: the same side has another go.
				var rb: int = _pick(a, {"FWD": 6, "MID": 3}, -1, -1)
				var res2: String = _take_shot(a, d, rb, "foot", -1)
				_after_shot(a, d, res2)
			else:
				_dur("short")
				_turnover(d, a, 0, gk)
		_:
			if rng.below(1000) < 170:
				_corner(a, d)
			else:
				_dur("out")
				_turnover(d, a, 0, gk)

func _maybe_injury() -> void:
	if rng.below(100000) >= 55:
		return
	var side: String = poss
	var s: Dictionary = sides[side]
	if int(s["subs"]) >= MAX_SUBS or s["off"][carrier] or s["xi"][carrier]["pos"] == "GK":
		return
	var pos: String = str(s["xi"][carrier]["pos"])
	for b in s["bench"].size():
		if s["bench"][b]["pos"] == pos:
			_emit({"type": "injury", "side": side, "slot": carrier, "player": _name(side, carrier), "ok": true, "tag": ""})
			substitute(side, carrier, b)
			return

# ------------------------------------------------------------------ results

func possession(side: String) -> int:
	var a: int = int(sides["home"]["stats"]["touches"])
	var b: int = int(sides["away"]["stats"]["touches"])
	if a + b == 0:
		return 50
	return int(sides[side]["stats"]["touches"]) * 100 / (a + b)

func ratings() -> Array:
	var out: Array = []
	for id in pstats:
		var ps: Dictionary = pstats[id]
		out.append({"pid": int(ps["pid"]), "name": ps["name"], "side": ps["side"], "pos": ps["pos"],
			"rating": int(ps["rating"]), "goals": ps["goals"], "assists": ps["assists"], "red": ps["red"]})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a["rating"]) != int(b["rating"]):
			return int(a["rating"]) > int(b["rating"])
		return int(a["pid"]) < int(b["pid"]))
	return out

func man_of_the_match() -> Dictionary:
	var r: Array = ratings()
	return r[0] if not r.is_empty() else {}

func result() -> Dictionary:
	return {
		"home": goals["home"], "away": goals["away"], "scorers": scorers.duplicate(true),
		"shots_home": sides["home"]["stats"]["shots"], "shots_away": sides["away"]["stats"]["shots"],
		"stats": {"home": sides["home"]["stats"].duplicate(), "away": sides["away"]["stats"].duplicate()},
		"possession_home": possession("home"), "mom": man_of_the_match(),
	}
