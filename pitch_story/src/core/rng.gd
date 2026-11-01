class_name PsRng
extends RefCounted
## Seeded mulberry32 on 32-bit integers. Same seed, same stream, on every platform.
## Never use randi()/randf() in simulation code: pass one of these around instead.

var s: int = 0

func _init(seed_value: int = 1) -> void:
	s = seed_value & 0xFFFFFFFF

static func _imul(a: int, b: int) -> int:
	return (a * b) & 0xFFFFFFFF

func next_u32() -> int:
	s = (s + 0x6D2B79F5) & 0xFFFFFFFF
	var t: int = s
	t = _imul(t ^ (t >> 15), t | 1)
	t = t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)
	return (t ^ (t >> 14)) & 0xFFFFFFFF

## Integer in [0, n).
func below(n: int) -> int:
	if n <= 1:
		return 0
	return next_u32() % n

## Integer in [lo, hi] inclusive.
func between(lo: int, hi: int) -> int:
	return lo + below(hi - lo + 1)

## True with probability per_mille / 1000.
func chance(per_mille: int) -> bool:
	return below(1000) < per_mille

func pick(arr: Array) -> Variant:
	return arr[below(arr.size())]

## Pick an index by integer weights.
func weighted(weights: Array) -> int:
	var total: int = 0
	for w in weights:
		total += int(w)
	if total <= 0:
		return 0
	var r: int = below(total)
	for i in weights.size():
		r -= int(weights[i])
		if r < 0:
			return i
	return weights.size() - 1

## Derive an independent seed for a sub-stream (a match, a name list...).
static func mix(a: int, b: int) -> int:
	var x: int = (a * 0x9E3779B1 + b * 0x85EBCA6B + 0x27D4EB2F) & 0xFFFFFFFF
	x = _imul(x ^ (x >> 16), 0x7FEB352D)
	x = _imul(x ^ (x >> 15), 0x846CA68B)
	return (x ^ (x >> 16)) & 0xFFFFFFFF
