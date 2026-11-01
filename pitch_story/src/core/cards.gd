class_name PsCards
extends RefCounted
## Draft cards. Cards never run arbitrary code: they are data, read by one small
## rule interpreter (flat / per-trait / conditional), then capped per channel.
## Channels: atk, def, tmp (tempo), sta (stamina).

const CHANNELS: Array = ["atk", "def", "tmp", "sta"]
const CAP_LO: int = -18
const CAP_HI: int = 34

## rarity 1 = common, 2 = rare (only drafted once the club is big enough)
const CARDS: Array = [
	{"id": "high_press", "name": "High Press", "rarity": 1, "tags": ["tempo"],
		"desc": "Win the ball high up the pitch. Tempo +10, defence -3.",
		"rules": [{"t": "flat", "ch": "tmp", "v": 10}, {"t": "flat", "ch": "def", "v": -3}]},
	{"id": "wing_overload", "name": "Wing Overload", "rarity": 1, "tags": ["wing", "attack"],
		"desc": "Attack +4 for every Winger in your XI (max +12).",
		"rules": [{"t": "per", "ch": "atk", "per": "winger", "v": 4, "max": 12}]},
	{"id": "park_bus", "name": "Park the Bus", "rarity": 1, "tags": ["defence"],
		"desc": "Everyone behind the ball. Defence +11, attack -5.",
		"rules": [{"t": "flat", "ch": "def", "v": 11}, {"t": "flat", "ch": "atk", "v": -5}]},
	{"id": "counter", "name": "Counter Attack", "rarity": 1, "tags": ["attack", "tempo"],
		"desc": "Attack +11 whenever you are not winning. Tempo -3.",
		"rules": [{"t": "when", "ch": "atk", "v": 11, "when": "not_lead"}, {"t": "flat", "ch": "tmp", "v": -3}]},
	{"id": "set_pieces", "name": "Set Piece Drills", "rarity": 1, "tags": ["attack", "defence"],
		"desc": "Hours on the training pitch. Attack +5, defence +5.",
		"rules": [{"t": "flat", "ch": "atk", "v": 5}, {"t": "flat", "ch": "def", "v": 5}]},
	{"id": "captain", "name": "Captain's Talk", "rarity": 1, "tags": ["spirit"],
		"desc": "A speech in the dressing room. +3 on every channel.",
		"rules": [{"t": "flat", "ch": "atk", "v": 3}, {"t": "flat", "ch": "def", "v": 3},
			{"t": "flat", "ch": "tmp", "v": 3}, {"t": "flat", "ch": "sta", "v": 3}]},
	{"id": "youth_fire", "name": "Youth Fire", "rarity": 1, "tags": ["youth"],
		"desc": "Attack and tempo +2 per player aged 21 or under (max +8 each).",
		"rules": [{"t": "per", "ch": "atk", "per": "young", "v": 2, "max": 8},
			{"t": "per", "ch": "tmp", "per": "young", "v": 2, "max": 8}]},
	{"id": "veteran", "name": "Veteran Wisdom", "rarity": 1, "tags": ["defence"],
		"desc": "Defence +3 per player aged 30 or over (max +12).",
		"rules": [{"t": "per", "ch": "def", "per": "old", "v": 3, "max": 12}]},
	{"id": "iron_wall", "name": "Iron Wall", "rarity": 1, "tags": ["defence"],
		"desc": "Defence +10 when the other side is stronger than you.",
		"rules": [{"t": "when", "ch": "def", "v": 10, "when": "stronger_opp"}]},
	{"id": "late_surge", "name": "Late Surge", "rarity": 1, "tags": ["attack", "stamina"],
		"desc": "From minute 70: attack +14, tempo +6.",
		"rules": [{"t": "when", "ch": "atk", "v": 14, "when": "late"}, {"t": "when", "ch": "tmp", "v": 6, "when": "late"}]},
	{"id": "fortress", "name": "Fortress Home", "rarity": 1, "tags": ["spirit"],
		"desc": "At home: attack, defence and tempo +5.",
		"rules": [{"t": "when", "ch": "atk", "v": 5, "when": "home"}, {"t": "when", "ch": "def", "v": 5, "when": "home"},
			{"t": "when", "ch": "tmp", "v": 5, "when": "home"}]},
	{"id": "fitness", "name": "Fitness Plan", "rarity": 1, "tags": ["stamina"],
		"desc": "Fresher legs late in the game. Stamina +18, attack +3.",
		"rules": [{"t": "flat", "ch": "sta", "v": 18}, {"t": "flat", "ch": "atk", "v": 3}]},
	{"id": "playmaker", "name": "Playmaker Rules", "rarity": 1, "tags": ["tempo", "attack"],
		"desc": "Tempo +3. A Playmaker in your XI adds tempo +7 and attack +6.",
		"rules": [{"t": "flat", "ch": "tmp", "v": 3}, {"t": "trait", "ch": "tmp", "v": 7, "trait": "playmaker"},
			{"t": "trait", "ch": "atk", "v": 6, "trait": "playmaker"}]},
	{"id": "giant_killer", "name": "Giant Killer", "rarity": 2, "tags": ["attack", "spirit"],
		"desc": "Against a stronger side: attack +15, defence +6.",
		"rules": [{"t": "when", "ch": "atk", "v": 15, "when": "stronger_opp"}, {"t": "when", "ch": "def", "v": 6, "when": "stronger_opp"}]},
	{"id": "golden_boot", "name": "Golden Boot", "rarity": 2, "tags": ["attack"],
		"desc": "Your striker smells blood. Attack +12.",
		"rules": [{"t": "flat", "ch": "atk", "v": 12}]},
	{"id": "total_football", "name": "Total Football", "rarity": 2, "tags": ["tempo", "stamina", "attack"],
		"desc": "Everyone does everything. +6 on every channel.",
		"rules": [{"t": "flat", "ch": "atk", "v": 6}, {"t": "flat", "ch": "def", "v": 6},
			{"t": "flat", "ch": "tmp", "v": 6}, {"t": "flat", "ch": "sta", "v": 6}]},
]

## Tag synergy: two or more cards sharing a tag add a bonus, three or more double it.
const SYNERGY: Dictionary = {
	"attack": {"label": "Attack synergy", "mods": {"atk": 5}},
	"defence": {"label": "Defence synergy", "mods": {"def": 5}},
	"tempo": {"label": "Tempo synergy", "mods": {"tmp": 5}},
	"stamina": {"label": "Stamina synergy", "mods": {"sta": 6}},
	"wing": {"label": "Wing synergy", "mods": {"atk": 3, "tmp": 3}},
	"youth": {"label": "Youth synergy", "mods": {"atk": 3, "tmp": 3}},
	"spirit": {"label": "Team spirit", "mods": {"atk": 2, "def": 2, "tmp": 2}},
}

static func get_card(id: String) -> Dictionary:
	for c in CARDS:
		if c["id"] == id:
			return c
	return {}

static func all_ids() -> Array:
	var out: Array = []
	for c in CARDS:
		out.append(c["id"])
	return out

static func synergies(card_ids: Array) -> Array:
	var counts: Dictionary = {}
	for id in card_ids:
		for t in get_card(str(id)).get("tags", []):
			counts[t] = int(counts.get(t, 0)) + 1
	var out: Array = []
	for t in counts:
		if int(counts[t]) >= 2 and SYNERGY.has(t):
			out.append({"tag": t, "count": int(counts[t]), "label": SYNERGY[t]["label"],
				"mult": 2 if int(counts[t]) >= 3 else 1, "mods": SYNERGY[t]["mods"]})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a["tag"]) < str(b["tag"]))
	return out

static func _cond(when: String, ctx: Dictionary) -> bool:
	match when:
		"trail": return int(ctx["my_goals"]) < int(ctx["opp_goals"])
		"lead": return int(ctx["my_goals"]) > int(ctx["opp_goals"])
		"not_lead": return int(ctx["my_goals"]) <= int(ctx["opp_goals"])
		"late": return int(ctx["minute"]) >= 70
		"home": return bool(ctx["home"])
		"away": return not bool(ctx["home"])
		"stronger_opp": return int(ctx["opp_power"]) > int(ctx["my_power"]) + 2
		"weaker_opp": return int(ctx["opp_power"]) + 2 < int(ctx["my_power"])
	return false

## One card's contribution at this moment: {channel: delta}.
static func card_delta(card: Dictionary, ctx: Dictionary) -> Dictionary:
	var d: Dictionary = {}
	for r in card["rules"]:
		var v: int = 0
		match r["t"]:
			"flat":
				v = int(r["v"])
			"per":
				v = mini(int(ctx.get(str(r["per"]), 0)) * int(r["v"]), int(r["max"]))
			"when":
				if _cond(str(r["when"]), ctx):
					v = int(r["v"])
			"trait":
				if int(ctx["traits"].get(str(r["trait"]), 0)) > 0:
					v = int(r["v"])
		if v != 0:
			d[r["ch"]] = int(d.get(r["ch"], 0)) + v
	return d

## All cards plus synergies for one side at one moment.
## Returns {"mods": {ch: int (capped)}, "tag": {ch: "card name that helps most"}}.
static func evaluate(card_ids: Array, ctx: Dictionary) -> Dictionary:
	var mods: Dictionary = {"atk": 0, "def": 0, "tmp": 0, "sta": 0}
	var best: Dictionary = {"atk": 0, "def": 0, "tmp": 0, "sta": 0}
	var tag: Dictionary = {"atk": "", "def": "", "tmp": "", "sta": ""}
	for id in card_ids:
		var card: Dictionary = get_card(str(id))
		if card.is_empty():
			continue
		var d: Dictionary = card_delta(card, ctx)
		for ch in d:
			mods[ch] += int(d[ch])
			if int(d[ch]) > int(best[ch]):
				best[ch] = int(d[ch])
				tag[ch] = card["name"]
	for s in synergies(card_ids):
		for ch in s["mods"]:
			var v: int = int(s["mods"][ch]) * int(s["mult"])
			mods[ch] += v
			if v > int(best[ch]):
				best[ch] = v
				tag[ch] = s["label"]
	for ch in CHANNELS:
		mods[ch] = clampi(int(mods[ch]), CAP_LO, CAP_HI)
	return {"mods": mods, "tag": tag}

## Three distinct cards to choose from. Bigger clubs get rarer cards.
static func draw_offer(rng: PsRng, club_level: int, owned: Array, count: int = 3) -> Array:
	var pool: Array = []
	var weights: Array = []
	for c in CARDS:
		if owned.has(c["id"]):
			continue
		var w: int = 10
		if int(c["rarity"]) >= 2:
			w = 0 if club_level < 3 else 3 + (club_level - 3) * 2
		if w > 0:
			pool.append(c["id"])
			weights.append(w)
	var out: Array = []
	while out.size() < count and not pool.is_empty():
		var i: int = rng.weighted(weights)
		out.append(pool[i])
		pool.remove_at(i)
		weights.remove_at(i)
	return out
