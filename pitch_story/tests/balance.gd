extends SceneTree
## Balance probe (not a test):  godot --headless --path pitch_story -s tests/balance.gd
func _init() -> void:
	var rng: PsRng = PsRng.new(7)
	for gap in [-10, -5, 0, 5, 10, 15]:
		var hw := 0; var dr := 0; var aw := 0; var goals := 0; var shots := 0
		var n := 600
		for i in n:
			var a: Array = PsPlayers.make_squad(rng, 55 + gap)
			var b: Array = PsPlayers.make_squad(rng, 55)
			var xa: Array = PsPlayers.lineup_players(a, PsPlayers.auto_lineup(a))
			var xb: Array = PsPlayers.lineup_players(b, PsPlayers.auto_lineup(b))
			var m: PsMatchSim = PsMatchSim.simulate(1000 + i, {"name": "A", "xi": xa, "cards": []}, {"name": "B", "xi": xb, "cards": []})
			var r: Dictionary = m.result()
			goals += int(r["home"]) + int(r["away"]); shots += int(r["shots_home"]) + int(r["shots_away"])
			if r["home"] > r["away"]: hw += 1
			elif r["home"] == r["away"]: dr += 1
			else: aw += 1
		print("gap %+d: win %d%% draw %d%% loss %d%%  goals/match %.2f  shots/match %.1f" % [gap, hw * 100 / n, dr * 100 / n, aw * 100 / n, float(goals) / n, float(shots) / n])
	quit(0)
