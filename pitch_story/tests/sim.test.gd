extends RefCounted

const EVENT_TYPES: Array = ["kickoff", "halftime", "fulltime", "pass", "dribble", "shot", "foul", "offside", "corner",
	"freekick", "penalty", "clearance", "sub", "injury", "mentality"]

func _team(seed_value: int, base: int, name: String, formation: String = "4-4-2", cards: Array = []) -> Dictionary:
	var rng: PsRng = PsRng.new(seed_value)
	var squad: Array = PsPlayers.make_squad(rng, base)
	var lineup: Dictionary = PsPlayers.auto_lineup(squad, formation)
	var xi: Array = PsPlayers.lineup_players(squad, lineup)
	var ids: Array = []
	for p in xi:
		ids.append(int(p["id"]))
	return {"name": name, "xi": xi, "bench": PsPlayers.bench_players(squad, ids), "cards": cards,
		"formation": formation, "mentality": "balanced", "ai": false}

func _json(m: PsMatchSim) -> String:
	return JSON.stringify(m.events)

func run(t: PsT) -> void:
	var home: Dictionary = _team(1, 55, "Home")
	var away: Dictionary = _team(2, 55, "Away")
	var m1: PsMatchSim = PsMatchSim.simulate(77, home, away)
	var m2: PsMatchSim = PsMatchSim.simulate(77, home, away)
	t.eq(_json(m1), _json(m2), "same seed replays the same match, event for event")
	t.ok(_json(m1) != _json(PsMatchSim.simulate(78, home, away)), "another seed plays another match")
	t.ok(m1.finished and m1.minute == 90, "match ends at minute 90")
	t.eq(m1.events[m1.events.size() - 1]["type"], "fulltime", "last event is fulltime")
	var halftimes: int = 0
	for e in m1.events:
		if e["type"] == "halftime":
			halftimes += 1
	t.eq(halftimes, 1, "exactly one half time")

	# Every event is well formed and time only moves forward.
	var last_t: int = -1
	var last_score: Array = [0, 0]
	var bad: int = 0
	var goal_events: int = 0
	var shot_events: int = 0
	for e in m1.events:
		if not EVENT_TYPES.has(e["type"]):
			bad += 1
		if int(e["t"]) < last_t:
			bad += 1
		last_t = int(e["t"])
		if int(e["score"][0]) < int(last_score[0]) or int(e["score"][1]) < int(last_score[1]):
			bad += 1
		last_score = e["score"]
		if int(e["min"]) < 1 or int(e["min"]) > 90:
			bad += 1
		for key in ["slot", "to", "by"]:
			if e.has(key) and (int(e[key]) < -1 or int(e[key]) > 10):
				bad += 1
		if e.has("zone") and (int(e["zone"]) < 0 or int(e["zone"]) > 3):
			bad += 1
		if e["type"] == "shot":
			shot_events += 1
			if e["result"] == "goal":
				goal_events += 1
	t.eq(bad, 0, "all events are well formed, in time order, with scores that only grow")
	t.eq(goal_events, int(m1.goals["home"]) + int(m1.goals["away"]), "goal events match the score")
	t.eq(m1.scorers.size(), goal_events, "one scorer entry per goal")
	t.eq(shot_events, int(m1.sides["home"]["stats"]["shots"]) + int(m1.sides["away"]["stats"]["shots"]), "shot stats match shot events")
	t.ok(abs(m1.possession("home") + m1.possession("away") - 100) <= 1, "possession adds up to 100%")

	# Whole-league plausibility: football-like numbers over 120 matches.
	var goals: int = 0
	var shots: int = 0
	var draws: int = 0
	var yellows: int = 0
	var fouls: int = 0
	var corners: int = 0
	var seen: Dictionary = {}
	var reds_found: Array = []
	for i in 120:
		var h: Dictionary = _team(100 + i, 55, "H")
		var a: Dictionary = _team(300 + i, 55, "A")
		var m: PsMatchSim = PsMatchSim.simulate(2000 + i, h, a)
		var r: Dictionary = m.result()
		goals += int(r["home"]) + int(r["away"])
		if int(r["home"]) == int(r["away"]):
			draws += 1
		for s in ["home", "away"]:
			shots += int(r["stats"][s]["shots"])
			yellows += int(r["stats"][s]["yellows"])
			fouls += int(r["stats"][s]["fouls"])
			corners += int(r["stats"][s]["corners"])
			if int(r["stats"][s]["reds"]) > 0:
				reds_found.append([2000 + i, s])
		for e in m.events:
			seen[e["type"]] = true
	t.ok(goals >= 240 and goals <= 400, "goals per match are plausible (%.2f)" % (float(goals) / 120.0))
	t.ok(shots >= 2000 and shots <= 3400, "shots per match are plausible (%.1f)" % (float(shots) / 120.0))
	t.ok(draws >= 18 and draws <= 50, "draws are neither rare nor everywhere (%d of 120)" % draws)
	t.ok(fouls > 1500, "there are real fouls (%.1f per match)" % (float(fouls) / 120.0))
	t.ok(yellows > 120 and yellows < 500, "yellow cards show up (%.1f per match)" % (float(yellows) / 120.0))
	t.ok(corners > 400, "corners happen (%.1f per match)" % (float(corners) / 120.0))
	for kind in ["pass", "dribble", "shot", "foul", "corner", "offside", "freekick", "clearance"]:
		t.ok(seen.has(kind), "a %s event happens in a normal run of matches" % kind)

	# Red cards: the player is gone for good, the side is weaker.
	t.ok(not reds_found.is_empty(), "a red card happens somewhere in 120 matches")
	if not reds_found.is_empty():
		var rs: int = int(reds_found[0][0])
		var rside: String = str(reds_found[0][1])
		var mr: PsMatchSim = PsMatchSim.simulate(rs, _team(100 + rs - 2000, 55, "H"), _team(300 + rs - 2000, 55, "A"))
		var off_slots: Array = []
		var reuse: int = 0
		for e in mr.events:
			if e["type"] == "foul" and e["card"] == "red" and e["side"] == rside:
				off_slots.append(int(e["slot"]))
			elif e["side"] == rside and not off_slots.is_empty():
				for key in ["slot", "to"]:
					if e.has(key) and off_slots.has(int(e[key])) and e["type"] in ["pass", "dribble", "shot"]:
						reuse += 1
		t.eq(reuse, 0, "a sent-off player never touches the ball again")
		t.ok(int(mr.sides[rside]["reds"]) >= 1, "the side is down to ten")

	# Formations.
	for f in PsFormations.LIST:
		var s: Dictionary = PsFormations.slots(f)
		t.eq(int(s["GK"]) + int(s["DEF"]) + int(s["MID"]) + int(s["FWD"]), 11, f + " has eleven players")
		t.eq(PsFormations.positions(f).size(), 11, f + " has eleven positions")
		var tm: Dictionary = _team(5, 55, "F", f)
		t.eq(tm["xi"].size(), 11, f + ": the XI is full")
		var mf: PsMatchSim = PsMatchSim.simulate(9, tm, away)
		t.ok(mf.finished, f + " plays a full match")
	var base442: Dictionary = PsMatchSim.team_base(_team(5, 55, "x")["xi"], "4-4-2")
	var base433: Dictionary = PsMatchSim.team_base(_team(5, 55, "x")["xi"], "4-3-3")
	t.eq(int(base433["atk"]) - int(base442["atk"]), 3, "4-3-3 adds 3 attack")
	t.eq(int(base433["def"]) - int(base442["def"]), -2, "4-3-3 costs 2 defence")

	# Mentality is a real trade-off: defending is hard to beat but scores little, attacking opens the game.
	var gf: Dictionary = {"defend": 0, "attack": 0}
	var ga: Dictionary = {"defend": 0, "attack": 0}
	for i in 150:
		var h: Dictionary = _team(100 + i, 55, "H")
		var a: Dictionary = _team(300 + i, 55, "A")
		for mm in ["defend", "attack"]:
			var hm: Dictionary = h.duplicate()
			hm["mentality"] = mm
			var mr2: PsMatchSim = PsMatchSim.simulate(500 + i, hm, a)
			gf[mm] += int(mr2.goals["home"])
			ga[mm] += int(mr2.goals["away"])
	t.ok(gf["attack"] > gf["defend"], "attacking scores more (%d vs %d)" % [gf["attack"], gf["defend"]])
	t.ok(ga["defend"] < ga["attack"], "defending concedes fewer (%d vs %d)" % [ga["defend"], ga["attack"]])

	# Decisions: mentality and substitutions, at a chosen minute.
	var live: PsMatchSim = PsMatchSim.create(5, home, away)
	for i in 30:
		live.step()
	t.eq(live.minute, 30, "thirty minutes played")
	var slot: int = int(live.tired_slots("home")[0])
	t.ok(live.energy_of("home", slot) < 100, "players tire")
	var bench_idx: int = -1
	var wrong_idx: int = -1
	var pos: String = str(live.sides["home"]["xi"][slot]["pos"])
	for b in live.sides["home"]["bench"].size():
		if live.sides["home"]["bench"][b]["pos"] == pos and bench_idx < 0:
			bench_idx = b
		elif live.sides["home"]["bench"][b]["pos"] != pos and wrong_idx < 0:
			wrong_idx = b
	t.ok(bench_idx >= 0, "there is a bench player for the position")
	if wrong_idx >= 0:
		t.ok(not live.substitute("home", slot, wrong_idx), "a substitute must play the same position")
	var incoming: String = str(live.sides["home"]["bench"][bench_idx]["name"])
	t.ok(live.substitute("home", slot, bench_idx), "a substitution is accepted")
	t.eq(str(live.sides["home"]["xi"][slot]["name"]), incoming, "the substitute is on the pitch")
	t.eq(live.energy_of("home", slot), 100, "and he is fresh")
	t.eq(live.calls_left("home"), PsMatchSim.MAX_SUBS - 1, "one substitution used")
	var done: int = 1
	for s2 in live.tired_slots("home"):
		if done >= PsMatchSim.MAX_SUBS:
			break
		var p2: String = str(live.sides["home"]["xi"][int(s2)]["pos"])
		for b2 in live.sides["home"]["bench"].size():
			if live.sides["home"]["bench"][b2]["pos"] == p2:
				if live.substitute("home", int(s2), b2):
					done += 1
				break
	var refused: bool = true
	for s3 in live.tired_slots("home"):
		for b3 in live.sides["home"]["bench"].size():
			if live.substitute("home", int(s3), b3):
				refused = false
	t.ok(refused or done < PsMatchSim.MAX_SUBS, "no more than three substitutions")
	t.ok(live.set_mentality("home", "attack"), "mentality can be changed")
	t.ok(not live.set_mentality("home", "reckless"), "an unknown mentality is refused")
	# A decision at minute 30 leaves everything before it untouched.
	var plan: Array = [{"min": 30, "side": "home", "mentality": "attack"}, {"min": 30, "side": "home", "sub": [slot, bench_idx]}]
	var base_run: PsMatchSim = PsMatchSim.simulate(5, home, away)
	var plan_run: PsMatchSim = PsMatchSim.simulate(5, home, away, plan)
	var k: int = 0
	for e in base_run.events:
		if int(e["t"]) < 1700:
			k += 1
	t.ok(k > 50, "there are events to compare (%d)" % k)
	t.eq(JSON.stringify(base_run.events.slice(0, k)), JSON.stringify(plan_run.events.slice(0, k)), "a decision at minute 30 changes nothing before it")
	t.eq(_json(plan_run), _json(PsMatchSim.simulate(5, home, away, plan)), "a match with decisions replays identically")

	# Energy: after ninety minutes the starters are tired, subs are not.
	var full: PsMatchSim = PsMatchSim.simulate(11, home, away)
	var avg: int = 0
	for i in 11:
		avg += int(full.sides["home"]["energy"][i])
	t.ok(avg / 11 < 650 and avg / 11 > 300, "starters are tired but not spent by full time (%d of 1000)" % (avg / 11))

	# Ratings and man of the match.
	var rs2: Array = full.ratings()
	t.ok(rs2.size() >= 22, "everyone who played is rated")
	var in_range: bool = true
	for r in rs2:
		if int(r["rating"]) < 300 or int(r["rating"]) > 1000:
			in_range = false
	t.ok(in_range, "ratings stay between 3.0 and 10.0")
	t.eq(int(full.man_of_the_match()["pid"]), int(rs2[0]["pid"]), "the man of the match has the top rating")
	if full.scorers.size() > 0:
		var sc_key: String = "%s:%d" % [full.scorers[0]["side"], int(full.scorers[0]["pid"])]
		var sc_rating: int = int(full.pstats[sc_key]["rating"])
		t.ok(sc_rating > 600, "a scorer is rated above the 6.0 starting point (%d)" % sc_rating)

	# Strength still matters, and cards still leave their mark on the log.
	var strong_wins: int = 0
	var weak_wins: int = 0
	for i in 150:
		var r3: Dictionary = PsMatchSim.simulate(1000 + i, _team(100 + i, 66, "S"), _team(300 + i, 54, "W")).result()
		if r3["home"] > r3["away"]:
			strong_wins += 1
		elif r3["home"] < r3["away"]:
			weak_wins += 1
	t.ok(strong_wins > weak_wins * 3, "a much stronger side wins far more often (%d vs %d)" % [strong_wins, weak_wins])
	var tagged: int = 0
	for i in 60:
		var mc: PsMatchSim = PsMatchSim.simulate(500 + i, _team(1, 55, "C", "4-4-2", ["golden_boot"]), away)
		for e in mc.events:
			if e["type"] == "shot" and e["result"] == "goal" and e["side"] == "home" and e["tag"] == "Golden Boot":
				tagged += 1
	t.ok(tagged > 0, "goals are tagged with the card behind them")
