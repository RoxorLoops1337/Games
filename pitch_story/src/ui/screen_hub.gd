class_name PsHubScreen
extends Control

var app: PsApp
var args: Dictionary = {}

func _ready() -> void:
	var st: Dictionary = app.st
	var s: Dictionary = st["season"]
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(6)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 6
	col.offset_right = -6
	col.offset_top = 6
	col.offset_bottom = -6
	add_child(col)

	# Top bar
	var top: PanelContainer = PsKit.panel(PsKit.PANEL)
	col.add_child(top)
	var tv: VBoxContainer = PsKit.vbox(2)
	top.add_child(tv)
	var r1: HBoxContainer = PsKit.hbox(6)
	tv.add_child(r1)
	var nm: Label = PsKit.lbl(str(st["club"]["name"]), 20, PsKit.GOLD)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nm.autowrap_mode = TextServer.AUTOWRAP_OFF
	nm.clip_text = true
	r1.add_child(nm)
	r1.add_child(PsKit.fixed(PsKit.money(int(st["club"]["money"])), 20, PsKit.CREAM, HORIZONTAL_ALIGNMENT_RIGHT))
	var r2: HBoxContainer = PsKit.hbox(6)
	tv.add_child(r2)
	var info: Label = PsKit.lbl("Season %d  ·  Day %d/%d  ·  %s place" % [int(s["no"]), mini(int(s["day"]) + 1, PsClub.MATCHDAYS), PsClub.MATCHDAYS, _ord(PsClub.position(st))], 14, PsKit.DIM)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.autowrap_mode = TextServer.AUTOWRAP_OFF
	r2.add_child(info)
	r2.add_child(PsKit.fixed("Fans %d/%d" % [PsClub.attendance(st), PsClub.stadium_capacity(st)], 14, PsKit.DIM, HORIZONTAL_ALIGNMENT_RIGHT))

	# Town, framed 4:3 so it never floats in empty ground on tall screens
	var town: PsTownView = PsTownView.new()
	var tw: float = maxf(300.0, app.holder.size.x - 12.0)
	town.custom_minimum_size = Vector2(0, floorf(tw * float(PsTownView.GH) / float(PsTownView.GW)))
	town.clip_contents = true
	town.set_state(st)
	col.add_child(town)

	# Manager's board: what to know before the next match
	var board: VBoxContainer = PsKit.vbox(6)
	col.add_child(PsKit.scroll(board))
	board.add_child(_fixture_panel(st))
	board.add_child(_form_panel(st))
	board.add_child(_cards_panel(st))

	# Main action
	var main_btn: Button
	if PsClub.is_season_over(st):
		main_btn = PsKit.btn("Season over: review it", func() -> void: _go("season_end"), "gold", 56)
	elif PsClub.draft_pending(st):
		main_btn = PsKit.btn("Draft a card for the next block", func() -> void: _go("draft"), "gold", 56)
	else:
		main_btn = PsKit.btn("Play match day %d" % (int(s["day"]) + 1), func() -> void: _go("match"), "primary", 56)
	col.add_child(main_btn)
	var row: HBoxContainer = PsKit.hbox(6)
	col.add_child(row)
	for item in [["Squad", "squad"], ["Club", "club"], ["Table", "table"], ["Menu", "settings"]]:
		var b: Button = PsKit.btn(item[0], _go.bind(item[1]), "normal", 44)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(b)

func _go(name: String) -> void:
	app.sfx.play("click")
	app.go(name, {"back": "hub"})

func _ord(n: int) -> String:
	var suffix: String = "th"
	if n % 100 < 11 or n % 100 > 13:
		match n % 10:
			1: suffix = "st"
			2: suffix = "nd"
			3: suffix = "rd"
	return "%d%s" % [n, suffix]

func _fixture_panel(st: Dictionary) -> Control:
	var p: PanelContainer = PsKit.panel(PsKit.INK_2)
	var v: VBoxContainer = PsKit.vbox(2)
	p.add_child(v)
	if PsClub.is_season_over(st):
		v.add_child(PsKit.lbl("The season is complete. You finished %s." % _ord(PsClub.position(st)), 16, PsKit.CREAM))
		return p
	var fx: Dictionary = PsClub.my_fixture(st)
	var opp: Dictionary = st["season"]["teams"][int(fx["opp"])]
	var block: int = PsClub.block_of_day(int(st["season"]["day"]))
	v.add_child(PsKit.lbl("Next: %s vs %s" % ["home" if fx["me_home"] else "away", opp["name"]], 17, PsKit.CREAM))
	var mine: Dictionary = PsMatchSim.team_base(PsClub.team_cfg(st, 0)["xi"])
	var theirs: Dictionary = PsMatchSim.team_base(PsClub.team_cfg(st, int(fx["opp"]))["xi"])
	var my_p: int = (int(mine["atk"]) + int(mine["def"]) + int(mine["tmp"])) / 3
	var op_p: int = (int(theirs["atk"]) + int(theirs["def"]) + int(theirs["tmp"])) / 3
	var verdict: String = "evenly matched"
	var vc: Color = PsKit.GOLD
	if op_p > my_p + 2:
		verdict = "they look stronger"
		vc = PsKit.RED
	elif op_p + 2 < my_p:
		verdict = "you look stronger"
		vc = PsKit.GRASS
	v.add_child(PsKit.lbl("Block %d, match %d of %d  ·  %s (you %d, them %d)" % [block + 1, int(st["season"]["day"]) - int(PsClub.BLOCK_STARTS[block]) + 1, PsClub.block_size(block), verdict, my_p, op_p], 13, vc))
	return p

func _form_panel(st: Dictionary) -> Control:
	var p: PanelContainer = PsKit.panel(PsKit.INK_2)
	var v: VBoxContainer = PsKit.vbox(3)
	p.add_child(v)
	var row: HBoxContainer = PsKit.hbox(4)
	v.add_child(row)
	row.add_child(PsKit.fixed("Form", 14, PsKit.DIM))
	var res: Array = st["season"]["results"]
	if res.is_empty():
		row.add_child(PsKit.fixed("no matches yet", 14, PsKit.DIM))
	for r in res.slice(-5):
		var tag: String = "W" if int(r["mg"]) > int(r["og"]) else ("D" if int(r["mg"]) == int(r["og"]) else "L")
		var tc: Color = PsKit.GRASS if tag == "W" else (PsKit.GOLD if tag == "D" else PsKit.RED)
		row.add_child(PsKit.fixed(tag, 16, tc))
	var best: Dictionary = {}
	for pl in st["squad"]:
		if int(pl["goals"]) > 0 and (best.is_empty() or int(pl["goals"]) > int(best["goals"])):
			best = pl
	if not best.is_empty():
		v.add_child(PsKit.lbl("Top scorer: %s (%d)" % [best["name"], int(best["goals"])], 13, PsKit.DIM))
	return p

func _cards_panel(st: Dictionary) -> Control:
	var p: PanelContainer = PsKit.panel(PsKit.INK_2)
	var v: VBoxContainer = PsKit.vbox(2)
	p.add_child(v)
	if st["cards"].is_empty():
		v.add_child(PsKit.lbl("No cards yet this season. Draft one before the next block.", 13, PsKit.DIM))
		return p
	v.add_child(PsKit.lbl("Your cards", 13, PsKit.DIM))
	for id in st["cards"]:
		var c: Dictionary = PsCards.get_card(str(id))
		v.add_child(PsKit.lbl("%s  %s" % [c["name"], c["desc"]], 13, PsKit.CREAM))
	for sy in PsCards.synergies(st["cards"]):
		v.add_child(PsKit.lbl("Synergy: %s%s" % [sy["label"], " x2" if int(sy["mult"]) > 1 else ""], 13, PsKit.GRASS))
	return p
