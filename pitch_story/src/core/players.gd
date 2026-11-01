class_name PsPlayers
extends RefCounted
## Player and squad generation. Players are plain Dictionaries so a save is just JSON.
## Stats are integers, roughly 25..90. att / def / tmp (tempo) / sta (stamina).

const FIRST: Array = [
	"Jan", "Piet", "Joske", "Thieu", "Bram", "Lars", "Daan", "Milan", "Noah", "Finn",
	"Jules", "Kobe", "Wout", "Senne", "Arne", "Luca", "Tibo", "Rune", "Mats", "Jef",
	"Diego", "Marco", "Yusuf", "Kenji", "Omar", "Tomas", "Erik", "Ivan", "Pablo", "Sami",
]
const LAST: Array = [
	"Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens",
	"Wouters", "De Smet", "Vermeulen", "Hendrickx", "Dubois", "Lambert", "Martens",
	"Silva", "Rossi", "Novak", "Okafor", "Tanaka", "Haddad", "Larsen", "Costa", "Ibrahim",
]
const TRAITS: Array = ["winger", "playmaker", "poacher", "wall", "engine", "prodigy"]
const TRAIT_LABEL: Dictionary = {
	"winger": "Winger", "playmaker": "Playmaker", "poacher": "Poacher",
	"wall": "Wall", "engine": "Engine", "prodigy": "Prodigy",
}
const POS_ORDER: Array = ["GK", "DEF", "MID", "FWD"]
const POS_COUNT: Dictionary = {"GK": 2, "DEF": 6, "MID": 7, "FWD": 5}

static func clampi_stat(v: int) -> int:
	return clampi(v, 20, 95)

static func make_player(rng: PsRng, id: int, pos: String, base: int) -> Dictionary:
	var spread: int = 7
	var p: Dictionary = {
		"id": id,
		"name": "%s %s" % [rng.pick(FIRST), rng.pick(LAST)],
		"pos": pos,
		"age": rng.between(17, 33),
		"att": base + rng.between(-spread, spread),
		"def": base + rng.between(-spread, spread),
		"tmp": base + rng.between(-spread, spread),
		"sta": base + rng.between(-spread, spread),
		"trait": "",
		"goals": 0,
		"apps": 0,
		"legend": false,
	}
	match pos:
		"GK":
			p["def"] += 10
			p["att"] -= 15
		"DEF":
			p["def"] += 8
			p["att"] -= 8
		"MID":
			p["tmp"] += 8
		"FWD":
			p["att"] += 9
			p["def"] -= 8
	for k in ["att", "def", "tmp", "sta"]:
		p[k] = clampi_stat(p[k])
	p["trait"] = pick_trait(rng, pos, p)
	return p

static func pick_trait(rng: PsRng, pos: String, p: Dictionary) -> String:
	if rng.chance(250):
		return ""
	var pool: Array = []
	match pos:
		"GK": pool = ["wall", "engine"]
		"DEF": pool = ["wall", "engine", "prodigy"]
		"MID": pool = ["playmaker", "engine", "winger", "prodigy"]
		"FWD": pool = ["poacher", "winger", "prodigy"]
	if int(p["age"]) <= 20 and rng.chance(400):
		return "prodigy"
	return str(rng.pick(pool))

## A full squad (2 GK, 6 DEF, 7 MID, 5 FWD) around `base` strength.
static func make_squad(rng: PsRng, base: int, first_id: int = 1) -> Array:
	var squad: Array = []
	var id: int = first_id
	for pos in POS_ORDER:
		for i in int(POS_COUNT[pos]):
			squad.append(make_player(rng, id, pos, base))
			id += 1
	return squad

## The stat that defines how good a player is at his own position.
static func main_stat(p: Dictionary) -> int:
	match str(p["pos"]):
		"GK", "DEF": return int(p["def"])
		"MID": return (int(p["tmp"]) * 2 + int(p["att"]) + int(p["def"])) / 4
		_: return int(p["att"])

static func overall(p: Dictionary) -> int:
	return main_stat(p)

## Best XI by position for a formation, as {"GK": [ids], "DEF": [ids], ...}.
static func auto_lineup(squad: Array, formation: String = PsFormations.DEFAULT) -> Dictionary:
	var out: Dictionary = {}
	var want: Dictionary = PsFormations.slots(formation)
	for pos in POS_ORDER:
		var cands: Array = []
		for p in squad:
			if p["pos"] == pos:
				cands.append(p)
		cands.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			var sa: int = main_stat(a)
			var sb: int = main_stat(b)
			if sa != sb:
				return sa > sb
			return int(a["id"]) < int(b["id"]))
		var ids: Array = []
		for i in mini(int(want[pos]), cands.size()):
			ids.append(int(cands[i]["id"]))
		out[pos] = ids
	return out

static func by_id(squad: Array, id: int) -> Dictionary:
	for p in squad:
		if int(p["id"]) == id:
			return p
	return {}

static func lineup_players(squad: Array, lineup: Dictionary) -> Array:
	var xi: Array = []
	for pos in POS_ORDER:
		for id in lineup.get(pos, []):
			var p: Dictionary = by_id(squad, int(id))
			if not p.is_empty():
				xi.append(p)
	return xi

## Repair a lineup that no longer matches the squad or the formation (sold player, bad save).
static func fix_lineup(squad: Array, lineup: Dictionary, formation: String = PsFormations.DEFAULT) -> Dictionary:
	var best: Dictionary = auto_lineup(squad, formation)
	var want: Dictionary = PsFormations.slots(formation)
	var out: Dictionary = {}
	for pos in POS_ORDER:
		var ids: Array = []
		for id in lineup.get(pos, []):
			var p: Dictionary = by_id(squad, int(id))
			if not p.is_empty() and p["pos"] == pos and not ids.has(int(id)):
				ids.append(int(id))
		for id in best[pos]:
			if ids.size() >= int(want[pos]):
				break
			if not ids.has(int(id)):
				ids.append(int(id))
		out[pos] = ids.slice(0, int(want[pos]))
	return out

## Five players on the bench: the best keeper, then the best of each outfield line, then the best left.
static func bench_players(squad: Array, xi_ids: Array) -> Array:
	var rest: Array = []
	for p in squad:
		if not xi_ids.has(int(p["id"])):
			rest.append(p)
	rest.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var sa: int = main_stat(a)
		var sb: int = main_stat(b)
		if sa != sb:
			return sa > sb
		return int(a["id"]) < int(b["id"]))
	var bench: Array = []
	for pos in POS_ORDER:
		for p in rest:
			if p["pos"] == pos:
				bench.append(p)
				break
	for p in rest:
		if bench.size() >= 5:
			break
		if not bench.has(p) and p["pos"] != "GK":
			bench.append(p)
	return bench

## Season roll-over: age, grow the young, slow the old.
static func age_squad(rng: PsRng, squad: Array, training_level: int) -> void:
	for p in squad:
		p["age"] = int(p["age"]) + 1
		var age: int = int(p["age"])
		for k in ["att", "def", "tmp", "sta"]:
			var d: int = 0
			if age <= 21:
				d = rng.between(1, 4)
			elif age <= 27:
				d = rng.between(0, 2)
			elif age <= 30:
				d = rng.between(-1, 1)
			else:
				d = rng.between(-3, 0)
			if p["trait"] == "prodigy" and age <= 24:
				d += 1
			d += training_level / 2
			p[k] = clampi_stat(int(p[k]) + d)
		if age >= 33 and not p["legend"]:
			p["retire"] = true

static func is_legend_candidate(p: Dictionary) -> bool:
	return int(p["goals"]) >= 25 or int(p["apps"]) >= 60
