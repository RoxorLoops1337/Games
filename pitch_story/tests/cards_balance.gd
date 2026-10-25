extends SceneTree
## Probe:  godot --headless --path pitch_story -s tests/cards_balance.gd
func _wins(cards: Array, n: int, gap: int) -> float:
	var w: float = 0.0
	for i in n:
		var rng: PsRng = PsRng.new(10000 + i)
		var a: Array = PsPlayers.make_squad(rng, 55 + gap)
		var b: Array = PsPlayers.make_squad(rng, 55)
		var ca: Dictionary = {"name": "A", "xi": PsPlayers.lineup_players(a, PsPlayers.auto_lineup(a)), "cards": cards}
		var cb: Dictionary = {"name": "B", "xi": PsPlayers.lineup_players(b, PsPlayers.auto_lineup(b)), "cards": []}
		var r: Dictionary = PsMatchSim.simulate(500 + i, ca, cb).result()
		if r["home"] > r["away"]: w += 1.0
		elif r["home"] == r["away"]: w += 0.5
	return w * 100.0 / n
func _init() -> void:
	var n: int = 500
	var base: float = _wins([], n, 0)
	print("baseline equal teams: %.1f%%" % base)
	for c in PsCards.CARDS:
		var v: float = _wins([c["id"]], n, 0)
		print("%-18s %5.1f%%  (%+.1f)" % [c["name"], v, v - base])
	print("--- stacks")
	for stack in [["golden_boot", "set_pieces", "late_surge", "giant_killer"], ["golden_boot", "total_football", "late_surge", "wing_overload"], PsCards.all_ids()]:
		print("%s -> %.1f%%" % [str(stack.size()) + " cards", _wins(stack, n, 0)])
	quit(0)
