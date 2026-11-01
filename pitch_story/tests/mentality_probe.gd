extends SceneTree
## Probe: what does mentality really do?  godot --headless --path pitch_story -s tests/mentality_probe.gd
func _team(seed_value: int, base: int, name: String, m: String) -> Dictionary:
	var rng: PsRng = PsRng.new(seed_value)
	var squad: Array = PsPlayers.make_squad(rng, base)
	var lineup: Dictionary = PsPlayers.auto_lineup(squad)
	var xi: Array = PsPlayers.lineup_players(squad, lineup)
	var ids: Array = []
	for p in xi: ids.append(int(p["id"]))
	return {"name": name, "xi": xi, "bench": PsPlayers.bench_players(squad, ids), "cards": [], "mentality": m, "ai": false}
func _init() -> void:
	for ment in ["defend", "balanced", "attack"]:
		var gf := 0; var ga := 0; var sf := 0; var sa := 0; var pts := 0; var poss := 0
		var n := 300
		for i in n:
			var m: PsMatchSim = PsMatchSim.simulate(500 + i, _team(100 + i, 55, "H", ment), _team(300 + i, 55, "A", "balanced"))
			var r: Dictionary = m.result()
			gf += int(r["home"]); ga += int(r["away"]); sf += int(r["stats"]["home"]["shots"]); sa += int(r["stats"]["away"]["shots"]); poss += int(r["possession_home"])
			pts += 3 if r["home"] > r["away"] else (1 if r["home"] == r["away"] else 0)
		print("%-9s GF %.2f GA %.2f | shots for %.1f against %.1f | poss %d%% | pts/match %.2f" % [ment, float(gf) / n, float(ga) / n, float(sf) / n, float(sa) / n, poss / n, float(pts) / n])
	quit(0)
