class_name PsFormations
extends RefCounted
## Formations: how many players per line, how they shift the team's channels, and where
## each slot stands on the pitch. Slot order is always GK, DEF..., MID..., FWD... so a lineup
## {"GK": [..], "DEF": [..], ...} flattens to slots 0..10.

const LIST: Array = ["4-4-2", "4-3-3", "3-5-2", "5-3-2"]
const DEFAULT: String = "4-4-2"

const SLOTS: Dictionary = {
	"4-4-2": {"GK": 1, "DEF": 4, "MID": 4, "FWD": 2},
	"4-3-3": {"GK": 1, "DEF": 4, "MID": 3, "FWD": 3},
	"3-5-2": {"GK": 1, "DEF": 3, "MID": 5, "FWD": 2},
	"5-3-2": {"GK": 1, "DEF": 5, "MID": 3, "FWD": 2},
}

## Channel shift a formation gives the whole team (added to atk / def / tmp / sta).
const MOD: Dictionary = {
	"4-4-2": {},
	"4-3-3": {"atk": 3, "def": -2, "tmp": -1},
	"3-5-2": {"tmp": 3, "atk": 1, "def": -2},
	"5-3-2": {"def": 4, "atk": -3, "tmp": -1},
}

const BLURB: Dictionary = {
	"4-4-2": "Balanced. Two strikers, a flat midfield.",
	"4-3-3": "Attack +3, defence -2. Three forwards, thinner midfield.",
	"3-5-2": "Tempo +3, attack +1, defence -2. Crowded midfield, three at the back.",
	"5-3-2": "Defence +4, attack -3. Five at the back, two on the break.",
}

static func slots(f: String) -> Dictionary:
	return SLOTS.get(f, SLOTS[DEFAULT])

static func valid(f: String) -> bool:
	return SLOTS.has(f)

static func count(f: String, pos: String) -> int:
	return int(slots(f)[pos])

## Normalised positions for the side attacking to the right: x 0 (own goal) .. 1, y 0..1.
static func positions(f: String) -> Array:
	var s: Dictionary = slots(f)
	var out: Array = [[0.05, 0.5]]
	out.append_array(_row(int(s["DEF"]), 0.2, 0.24))
	out.append_array(_row(int(s["MID"]), 0.45, 0.47))
	out.append_array(_row(int(s["FWD"]), 0.68, 0.7))
	return out

static func _row(n: int, x: float, x_wide: float) -> Array:
	var ys: Array = []
	match n:
		1: ys = [0.5]
		2: ys = [0.36, 0.64]
		3: ys = [0.2, 0.5, 0.8]
		4: ys = [0.12, 0.38, 0.62, 0.88]
		_: ys = [0.1, 0.3, 0.5, 0.7, 0.9]
	var out: Array = []
	for i in ys.size():
		var wide: bool = n >= 4 and (i == 0 or i == ys.size() - 1)
		out.append([x_wide if wide else x, ys[i]])
	return out

## 0 = left, 1 = centre, 2 = right.
static func lane_of(y: float) -> int:
	if y < 0.34:
		return 0
	if y > 0.66:
		return 2
	return 1
