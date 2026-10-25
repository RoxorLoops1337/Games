extends RefCounted

func _cfg(seed_value: int, base: int, name: String, cards: Array = []) -> Dictionary:
	var rng: PsRng = PsRng.new(seed_value)
	var squad: Array = PsPlayers.make_squad(rng, base)
	return {"name": name, "xi": PsPlayers.lineup_players(squad, PsPlayers.auto_lineup(squad)), "cards": cards}

func run(t: PsT) -> void:
	var home: Dictionary = _cfg(1, 55, "Home")
	var away: Dictionary = _cfg(2, 55, "Away")
	var m1: PsMatchSim = PsMatchSim.simulate(77, home, away)
	var m2: PsMatchSim = PsMatchSim.simulate(77, home, away)
	t.eq(JSON.stringify(m1.events), JSON.stringify(m2.events), "same seed replays the same event log")
	t.ok(m1.finished and m1.minute == 90, "match ends at minute 90")
	t.eq(m1.events[m1.events.size() - 1]["type"], "fulltime", "last event is fulltime")
	var goal_events: int = 0
	for e in m1.events:
		if e["type"] == "goal":
			goal_events += 1
	t.eq(goal_events, int(m1.goals["home"]) + int(m1.goals["away"]), "goal events match the score")
	var m3: PsMatchSim = PsMatchSim.simulate(78, home, away)
	t.ok(JSON.stringify(m1.events) != JSON.stringify(m3.events), "another seed gives another match")

	# Live calls: applied at a minute, replayed identically, limited to two.
	var calls: Array = [{"min": 30, "side": "home", "id": "push"}, {"min": 60, "side": "home", "id": "legs"}]
	var c1: PsMatchSim = PsMatchSim.simulate(77, home, away, calls)
	var c2: PsMatchSim = PsMatchSim.simulate(77, home, away, calls)
	t.eq(JSON.stringify(c1.events), JSON.stringify(c2.events), "a match with calls replays identically")
	var live: PsMatchSim = PsMatchSim.create(5, home, away)
	t.ok(live.apply_call("home", "push"), "first call accepted")
	t.ok(live.apply_call("home", "bus"), "second call accepted")
	t.ok(not live.apply_call("home", "legs"), "third call refused")
	t.eq(live.calls_left("home"), 0, "no calls left")
	t.eq(live.calls_left("away"), 2, "other side still has its calls")
	t.ok(not live.apply_call("away", "nonsense"), "unknown call refused")

	# The first 29 minutes must not change because of a call made at minute 30.
	var base_run: PsMatchSim = PsMatchSim.simulate(77, home, away)
	var early_a: Array = []
	var early_b: Array = []
	for e in base_run.events:
		if int(e["min"]) < 30 and e["type"] != "call":
			early_a.append(e)
	for e in c1.events:
		if int(e["min"]) < 30 and e["type"] != "call":
			early_b.append(e)
	t.eq(JSON.stringify(early_a), JSON.stringify(early_b), "a call at minute 30 leaves minutes 1-29 untouched")

	# Strength matters.
	var strong_wins: int = 0
	var weak_wins: int = 0
	for i in 200:
		var s: Dictionary = _cfg(100 + i, 66, "S")
		var w: Dictionary = _cfg(300 + i, 54, "W")
		var r: Dictionary = PsMatchSim.simulate(1000 + i, s, w).result()
		if r["home"] > r["away"]:
			strong_wins += 1
		elif r["home"] < r["away"]:
			weak_wins += 1
	t.ok(strong_wins > weak_wins * 3, "a much stronger side wins far more often (%d vs %d)" % [strong_wins, weak_wins])

	# Events carry the card that caused them.
	var carded: Dictionary = _cfg(1, 55, "Carded", ["golden_boot"])
	var tagged: int = 0
	for i in 40:
		var m: PsMatchSim = PsMatchSim.simulate(500 + i, carded, away)
		for e in m.events:
			if e["type"] == "goal" and e["side"] == "home" and e["tag"] == "Golden Boot":
				tagged += 1
	t.ok(tagged > 0, "goals are tagged with the card behind them")
	# Sanity of goals per match.
	var goals: int = 0
	for i in 100:
		var r2: Dictionary = PsMatchSim.simulate(2000 + i, home, away).result()
		goals += int(r2["home"]) + int(r2["away"])
	t.ok(goals >= 180 and goals <= 380, "goals per match stay plausible (%.2f)" % (float(goals) / 100.0))
