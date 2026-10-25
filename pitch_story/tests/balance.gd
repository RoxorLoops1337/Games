extends SceneTree
## Balance probe (not a test):  godot --headless --path pitch_story -s tests/balance.gd
func _init() -> void:
	var rng: PsRng = PsRng.new(7)
	var t0: int = Time.get_ticks_msec()
	for gap in [-10, -5, 0, 5, 10, 15]:
		var hw := 0; var dr := 0; var aw := 0
		var goals := 0; var evs := 0; var shots := 0; var sot := 0; var corners := 0; var fouls := 0; var yel := 0; var red := 0; var poss := 0; var offs := 0
		var n := 400
		for i in n:
			var a: Array = PsPlayers.make_squad(rng, 55 + gap)
			var b: Array = PsPlayers.make_squad(rng, 55)
			var la: Dictionary = PsPlayers.auto_lineup(a)
			var lb: Dictionary = PsPlayers.auto_lineup(b)
			var xa: Array = PsPlayers.lineup_players(a, la)
			var xb: Array = PsPlayers.lineup_players(b, lb)
			var m: PsMatchSim = PsMatchSim.simulate(1000 + i, {"name": "A", "xi": xa, "bench": PsPlayers.bench_players(a, la.values().reduce(func(x, y): return x + y)), "cards": []}, {"name": "B", "xi": xb, "bench": PsPlayers.bench_players(b, lb.values().reduce(func(x, y): return x + y)), "cards": []})
			var r: Dictionary = m.result()
			evs += m.events.size()
			goals += int(r["home"]) + int(r["away"])
			for s in ["home", "away"]:
				shots += int(r["stats"][s]["shots"]); sot += int(r["stats"][s]["on_target"]); corners += int(r["stats"][s]["corners"])
				fouls += int(r["stats"][s]["fouls"]); yel += int(r["stats"][s]["yellows"]); red += int(r["stats"][s]["reds"]); offs += int(r["stats"][s]["offsides"])
			poss += int(r["possession_home"])
			if r["home"] > r["away"]: hw += 1
			elif r["home"] == r["away"]: dr += 1
			else: aw += 1
		print("gap %+d: W%d D%d L%d | goals %.2f shots %.1f sot %.1f corners %.1f fouls %.1f yel %.2f red %.2f offs %.1f poss %d%% events/match %d" % [gap, hw * 100 / n, dr * 100 / n, aw * 100 / n, float(goals) / n, float(shots) / n, float(sot) / n, float(corners) / n, float(fouls) / n, float(yel) / n, float(red) / n, float(offs) / n, poss / n, evs / n])
	print("ms per match: %.1f" % (float(Time.get_ticks_msec() - t0) / (6 * 400)))
	quit(0)
