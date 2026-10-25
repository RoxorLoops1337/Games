extends RefCounted

func _play_day(st: Dictionary, calls: Array = []) -> Dictionary:
	var fx: Dictionary = PsClub.my_fixture(st)
	var sim: PsMatchSim = PsMatchSim.simulate(PsClub.match_seed(st),
		PsClub.team_cfg(st, int(fx["home"]), int(fx["home"]) == 0),
		PsClub.team_cfg(st, int(fx["away"]), int(fx["away"]) == 0), calls)
	return PsClub.finish_matchday(st, sim)

func run(t: PsT) -> void:
	# Fixtures: everyone plays everyone twice, once at home and once away.
	var fx: Array = PsClub.make_fixtures()
	t.eq(fx.size(), PsClub.MATCHDAYS, "14 match days")
	var pair_count: Dictionary = {}
	var per_day_ok: bool = true
	for day in fx:
		var seen: Dictionary = {}
		for f in day:
			seen[f[0]] = true
			seen[f[1]] = true
			var key: String = "%d-%d" % [f[0], f[1]]
			pair_count[key] = int(pair_count.get(key, 0)) + 1
		if seen.size() != PsClub.TEAMS:
			per_day_ok = false
	t.ok(per_day_ok, "every team plays exactly once per match day")
	t.eq(pair_count.size(), PsClub.TEAMS * (PsClub.TEAMS - 1), "56 distinct home/away pairings")
	var dup: bool = false
	for k in pair_count:
		if int(pair_count[k]) != 1:
			dup = true
	t.ok(not dup, "no pairing repeats")

	# A new game.
	var st: Dictionary = PsClub.new_game(2026, "Test FC", 1)
	t.eq(st["squad"].size(), 20, "twenty players")
	t.eq(PsClub.draft_pending(st), true, "a draft is offered before the first block")
	t.eq(st["offer"].size(), 3, "three cards offered")
	t.ok(not PsClub.pick_card(st, "not_offered"), "cannot pick a card that was not offered")
	t.ok(PsClub.pick_card(st, st["offer"][0]), "can pick an offered card")
	t.eq(st["cards"].size(), 1, "the card is now owned")
	t.ok(not PsClub.draft_pending(st), "draft closes after a pick")

	# Same seed, same world.
	var st2: Dictionary = PsClub.new_game(2026, "Test FC", 1)
	t.eq(JSON.stringify(st2["squad"]), JSON.stringify(PsClub.new_game(2026, "Test FC", 1)["squad"]), "same seed gives the same squad")
	t.eq(JSON.stringify(st2["season"]["teams"]), JSON.stringify(st["season"]["teams"]), "same seed gives the same league")

	# Play a whole season.
	var drafts: int = 1
	var guard: int = 0
	while not PsClub.is_season_over(st) and guard < 40:
		guard += 1
		if PsClub.draft_pending(st):
			PsClub.pick_card(st, st["offer"][0])
			drafts += 1
		_play_day(st)
	t.eq(guard, PsClub.MATCHDAYS, "exactly 14 match days were played")
	t.eq(drafts, 4, "four drafts in a season (before each block)")
	t.eq(st["cards"].size(), 4, "four cards drafted")
	var table: Array = PsClub.table_sorted(st)
	var pts: int = 0
	var gf: int = 0
	var ga: int = 0
	for row in table:
		t.eq(row["p"], 14, "each team played 14 (%s)" % row["name"])
		t.eq(row["w"] + row["d"] + row["l"], 14, "w+d+l = played")
		t.eq(row["pts"], row["w"] * 3 + row["d"], "points add up")
		pts += row["pts"]
		gf += row["gf"]
		ga += row["ga"]
	t.eq(gf, ga, "goals for equal goals against across the league")
	t.ok(table[0]["pts"] >= table[1]["pts"], "table is sorted")
	t.ok(PsClub.position(st) >= 1 and PsClub.position(st) <= 8, "position is 1 to 8")
	t.eq(st["season"]["results"].size(), 14, "14 results logged")
	var apps: int = 0
	for p in st["squad"]:
		apps += int(p["apps"])
	t.eq(apps, 14 * 11, "every match gave 11 appearances")

	# Roll over to the next season.
	var legacy: String = st["cards"][0]
	var sq: int = st["squad"].size()
	var rep: Dictionary = PsClub.end_season(st, legacy)
	t.eq(st["season"]["no"], 2, "season 2 starts")
	t.eq(st["season"]["day"], 0, "back to match day 0")
	t.eq(st["seasons_done"], 1, "one season done")
	t.ok(st["cards"].has(legacy) and st["cards"].size() == 1, "the legacy card carries over")
	t.ok(PsClub.draft_pending(st), "a new draft opens")
	var counts: Dictionary = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
	for p in st["squad"]:
		counts[p["pos"]] += 1
	for pos in PsPlayers.POS_ORDER:
		t.ok(int(counts[pos]) >= int(PsPlayers.POS_COUNT[pos]), "squad refilled at " + pos)
	t.ok(rep["prize"] >= 0, "prize money is not negative")
	var lineup_ok: bool = true
	for pos in PsPlayers.POS_ORDER:
		if st["lineup"][pos].size() != int(PsPlayers.LINEUP_SLOTS[pos]):
			lineup_ok = false
	t.ok(lineup_ok, "the lineup is complete after the roll-over")
	var ages_ok: bool = true
	for p in st["squad"]:
		if int(p["age"]) < 16 or int(p["age"]) > 40:
			ages_ok = false
	t.ok(ages_ok, "ages stay sane")

	# Facilities and money.
	var fac: Dictionary = PsClub.new_game(5, "Rich FC", 0)
	t.ok(not PsClub.upgrade(fac, "stand"), "cannot upgrade without money")
	fac["club"]["money"] = 10000
	var before: int = PsClub.club_level(fac)
	t.ok(PsClub.upgrade(fac, "stand"), "can upgrade with money")
	t.eq(fac["club"]["money"], 10000 - 600, "the upgrade costs its price")
	t.eq(PsClub.club_level(fac), before + 1, "club level rises")
	for i in 6:
		PsClub.upgrade(fac, "stand")
	t.eq(PsClub.facility(fac, "stand"), PsClub.FAC_MAX, "facilities stop at the maximum")
	t.eq(PsClub.upgrade_cost(fac, "stand"), -1, "no price past the maximum")

	# Money moves with results: it must not grow without bound or collapse in a normal season.
	var eco: Dictionary = PsClub.new_game(11, "Eco FC", 2)
	var start_money: int = int(eco["club"]["money"])
	while not PsClub.is_season_over(eco):
		if PsClub.draft_pending(eco):
			PsClub.pick_card(eco, eco["offer"][0])
		_play_day(eco)
	var delta: int = int(eco["club"]["money"]) - start_money
	t.ok(delta > -600 and delta < 3500, "season profit is in a sane range (%d)" % delta)
