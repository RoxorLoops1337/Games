extends SceneTree
## Probe: a greedy player over several seasons.  godot --headless --path pitch_story -s tests/career.gd
func _init() -> void:
	var sums: Array = [0, 0, 0, 0, 0, 0, 0, 0]
	var champs: Array = [0, 0, 0, 0, 0, 0, 0, 0]
	var money_end: int = 0
	var seeds: Array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
	for seed_value in seeds:
		var st: Dictionary = PsClub.new_game(seed_value, "Probe FC", 0)
		var line: String = "seed %d:" % seed_value
		for season in 8:
			while not PsClub.is_season_over(st):
				if PsClub.draft_pending(st):
					PsClub.pick_card(st, st["offer"][0])
				var fx: Dictionary = PsClub.my_fixture(st)
				var sim: PsMatchSim = PsMatchSim.simulate(PsClub.match_seed(st), PsClub.team_cfg(st, int(fx["home"]), int(fx["home"]) == 0), PsClub.team_cfg(st, int(fx["away"]), int(fx["away"]) == 0))
				PsClub.finish_matchday(st, sim)
				for f in ["training", "stand", "lights", "academy"]:
					if PsClub.can_upgrade(st, f) and PsClub.facility(st, f) < 3:
						PsClub.upgrade(st, f)
						break
			var pos: int = PsClub.position(st)
			line += " %d" % pos
			sums[season] += pos
			if pos == 1: champs[season] += 1
			PsClub.end_season(st, st["cards"][0])
		money_end += int(st["club"]["money"])
	var avg: Array = []
	for i in 8:
		avg.append("%.1f/%d%%" % [float(sums[i]) / seeds.size(), champs[i] * 100 / seeds.size()])
	print("avg position / title rate by season: ", " ".join(avg), "  avg end money ", money_end / seeds.size())
	quit(0)
