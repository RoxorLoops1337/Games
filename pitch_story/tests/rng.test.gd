extends RefCounted

func run(t: PsT) -> void:
	var a: PsRng = PsRng.new(12345)
	var b: PsRng = PsRng.new(12345)
	var same: bool = true
	for i in 1000:
		if a.next_u32() != b.next_u32():
			same = false
	t.ok(same, "same seed gives the same stream")
	# Known first outputs pin the algorithm, so replays stay valid across engine versions.
	var c: PsRng = PsRng.new(1)
	var first: Array = [c.next_u32(), c.next_u32(), c.next_u32()]
	t.eq(first, [2693262067, 11749833, 2265367787], "matches the canonical JavaScript mulberry32 (seed 1)")
	var d: PsRng = PsRng.new(12345)
	t.eq([d.next_u32(), d.next_u32()], [4207900869, 1317490944], "matches the canonical JavaScript mulberry32 (seed 12345)")
	var r: PsRng = PsRng.new(99)
	var lo: int = 999
	var hi: int = -1
	for i in 5000:
		var v: int = r.between(3, 9)
		lo = mini(lo, v)
		hi = maxi(hi, v)
	t.eq(lo, 3, "between lower bound reached")
	t.eq(hi, 9, "between upper bound reached")
	t.ok(PsRng.mix(1, 2) != PsRng.mix(2, 1), "mix is order sensitive")
	var w: PsRng = PsRng.new(5)
	var hits: Array = [0, 0, 0]
	for i in 6000:
		hits[w.weighted([1, 2, 3])] += 1
	t.ok(hits[0] < hits[1] and hits[1] < hits[2], "weighted respects weights")
	t.eq(PsRng.new(5).weighted([0, 0, 0]), 0, "weighted with no weight does not crash")
