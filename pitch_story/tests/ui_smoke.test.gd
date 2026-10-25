extends RefCounted
## Drives the real screens through a whole match day and a season end.

func _is(app: PsApp, cls: GDScript) -> bool:
	return app.screen != null and is_instance_of(app.screen, cls)

func run(t: PsT) -> void:
	PsSave.wipe()
	var app: PsApp = PsApp.new()
	t.tree.root.add_child(app)
	await t.tree.process_frame
	t.ok(_is(app, PsTitleScreen), "the game opens on the title screen")
	app.start_new("UI FC", 2)
	app.go("hub")
	await t.tree.process_frame
	t.ok(_is(app, PsHubScreen), "hub opens")
	# Draft
	t.ok(PsClub.draft_pending(app.st), "a draft is waiting")
	app.go("draft")
	await t.tree.process_frame
	app.screen._select(1)
	t.ok(not app.screen._take.disabled, "choosing a card enables the button")
	app.screen._confirm()
	await t.tree.process_frame
	t.ok(_is(app, PsHubScreen) and app.st["cards"].size() == 1, "the draft returns to the hub with a card")

	# A match played event by event, with the three team talks.
	app.go("match")
	await t.tree.process_frame
	var m: PsMatchScreen = app.screen
	var guard: int = 0
	var talks: int = 0
	var subbed: int = 0
	while not m._ended and guard < 20000:
		guard += 1
		if m._talking:
			talks += 1
			t.ok(m.talk.visible, "the team talk is showing while the match waits")
			if talks == 1:
				m._set_mentality("attack")
				var slot: int = int(m.sim.tired_slots(m.my_side)[0])
				m._pick_out(slot)
				for b in m.sim.sides[m.my_side]["bench"].size():
					if m.sim.sides[m.my_side]["bench"][b]["pos"] == m.sim.sides[m.my_side]["xi"][slot]["pos"]:
						m._do_sub(b)
						subbed += 1
						break
			m._close_talk()
		else:
			m._wait = 0.0
			m._tick()
	t.eq(talks, 3, "the match pauses three times (30', half time, 65')")
	t.eq(subbed, 1, "a substitution was made through the screen")
	t.eq(str(m.sim.sides[m.my_side]["mentality"]), "attack", "the mentality change reached the sim")
	t.ok(m._ended and m.done_btn.visible, "the match reaches full time")
	t.eq(m.score_l.text, "%d - %d" % [m.sim.goals["home"], m.sim.goals["away"]], "the scoreboard shows the final score")
	var day_before: int = int(app.st["season"]["day"])
	m._finish()
	await t.tree.process_frame
	t.ok(_is(app, PsResultScreen), "the result screen follows")
	t.eq(int(app.st["season"]["day"]), day_before + 1, "the match day was recorded")
	t.ok(PsSave.has_save(), "the game saved after the match")
	t.ok(app.st["last_match"].has("ratings"), "the match summary keeps the ratings")
	app.screen._next()
	await t.tree.process_frame
	t.ok(_is(app, PsHubScreen), "back to the hub")

	# Skipping a match works too.
	app.go("match")
	await t.tree.process_frame
	app.screen._skip()
	t.ok(app.screen._ended, "skip plays the match to the end")
	app.screen._finish()
	await t.tree.process_frame
	t.ok(_is(app, PsResultScreen), "skip also ends on the result screen")
	app.go("hub")
	await t.tree.process_frame

	# Other screens build without trouble.
	for name in ["squad", "club", "table", "settings"]:
		app.go(name, {"back": "hub"})
		await t.tree.process_frame
		t.ok(app.screen != null, name + " screen builds")
	# Squad swap
	app.go("squad")
	await t.tree.process_frame
	var sq: PsSquadScreen = app.screen
	var lineup_before: String = JSON.stringify(app.st["lineup"])
	var bench: Dictionary = {}
	var starter: Dictionary = {}
	for p in app.st["squad"]:
		if p["pos"] == "DEF":
			if sq._is_starter(int(p["id"])):
				starter = p
			else:
				bench = p
	sq._tap(int(starter["id"]))
	sq._tap(int(bench["id"]))
	t.ok(JSON.stringify(app.st["lineup"]) != lineup_before, "tapping a starter then a bench player swaps them")
	t.ok(app.st["lineup"]["DEF"].has(int(bench["id"])), "the bench player is now in the XI")
	t.eq(app.st["lineup"]["DEF"].size(), 4, "still four defenders")
	sq._auto()
	# Club upgrade
	app.st["club"]["money"] = 5000
	app.go("club")
	await t.tree.process_frame
	app.screen._upgrade("stand")
	t.eq(PsClub.facility(app.st, "stand"), 1, "the club screen upgrades a facility")
	# Settings export then import
	app.go("settings", {"back": "hub"})
	await t.tree.process_frame
	var ss: PsSettingsScreen = app.screen
	ss._export()
	t.ok(ss._box.text.length() > 100, "export fills the box")
	var money: int = int(app.st["club"]["money"])
	app.st["club"]["money"] = 1
	ss._import()
	await t.tree.process_frame
	t.eq(int(app.st["club"]["money"]), money, "import restores the exported state")
	app.go("settings", {"back": "hub"})
	await t.tree.process_frame
	ss = app.screen
	ss._box.text = "this is not a save"
	ss._import()
	t.ok(str(ss._msg.text).begins_with("Import failed"), "a bad import is refused with a message")

	# Season end through the screen.
	var guard2: int = 0
	while not PsClub.is_season_over(app.st) and guard2 < 40:
		guard2 += 1
		if PsClub.draft_pending(app.st):
			PsClub.pick_card(app.st, app.st["offer"][0])
		var fx: Dictionary = PsClub.my_fixture(app.st)
		var sim: PsMatchSim = PsMatchSim.simulate(PsClub.match_seed(app.st), PsClub.team_cfg(app.st, int(fx["home"]), int(fx["home"]) == 0), PsClub.team_cfg(app.st, int(fx["away"]), int(fx["away"]) == 0))
		PsClub.finish_matchday(app.st, sim)
	app.go("season_end")
	await t.tree.process_frame
	t.ok(_is(app, PsSeasonEndScreen), "season end screen opens")
	app.screen._start_next()
	await t.tree.process_frame
	t.eq(int(app.st["season"]["no"]), 2, "season 2 begins from the season end screen")
	app.go("hub")
	await t.tree.process_frame
	t.ok(_is(app, PsHubScreen), "and the hub shows the new season")
	app.queue_free()
	PsSave.wipe()
