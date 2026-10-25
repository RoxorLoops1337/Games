extends SceneTree
func _init() -> void:
	var rng: PsRng = PsRng.new(3)
	var tot := {30: 0, 45: 0, 65: 0, 90: 0}
	var n := 40
	for i in n:
		var sq: Array = PsPlayers.make_squad(rng, 55)
		var sq2: Array = PsPlayers.make_squad(rng, 55)
		var xi: Array = PsPlayers.lineup_players(sq, PsPlayers.auto_lineup(sq))
		var xi2: Array = PsPlayers.lineup_players(sq2, PsPlayers.auto_lineup(sq2))
		var m: PsMatchSim = PsMatchSim.create(900 + i, {"name": "A", "xi": xi, "bench": [], "cards": []}, {"name": "B", "xi": xi2, "bench": [], "cards": []})
		while not m.finished:
			m.step()
			if tot.has(m.minute):
				var e := 0
				for k in 11: e += int(m.sides["home"]["energy"][k])
				tot[m.minute] += e / 11
	for k in tot: print("minute %d: average energy %d%%" % [k, tot[k] / n / 10])
	quit(0)
