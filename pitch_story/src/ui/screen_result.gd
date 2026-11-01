class_name PsResultScreen
extends Control

var app: PsApp
var args: Dictionary = {}

func _ready() -> void:
	var sm: Dictionary = args["summary"]
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(6)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 10
	col.offset_right = -10
	col.offset_top = 10
	col.offset_bottom = -10
	add_child(col)
	var head: String = {"win": "VICTORY!", "draw": "A draw", "loss": "Defeat"}[sm["outcome"]]
	var hc: Color = {"win": PsKit.GRASS, "draw": PsKit.GOLD, "loss": PsKit.RED}[sm["outcome"]]
	col.add_child(PsKit.lbl(head, 40, hc, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(PsKit.lbl("%s %s  %d - %d  %s" % ["vs" if sm["home"] else "at", sm["opp"], int(sm["my_goals"]), int(sm["opp_goals"]), "(home)" if sm["home"] else "(away)"], 18, PsKit.CREAM, HORIZONTAL_ALIGNMENT_CENTER))
	app.sfx.play({"win": "win", "draw": "pick", "loss": "lose"}[sm["outcome"]])
	var body: VBoxContainer = PsKit.vbox(6)
	col.add_child(PsKit.scroll(body))

	# Scorers, with who set them up
	var my_side: String = str(args["my_side"])
	var mine: Array = []
	for sc in sm["scorers"]:
		if sc["side"] == my_side:
			var line: String = "%s %d'" % [sc["name"], int(sc["min"])]
			if str(sc.get("assist", "")) != "":
				line += " (assist %s)" % sc["assist"]
			mine.append(line)
	if not mine.is_empty():
		body.add_child(_card("Your scorers", "\n".join(mine)))

	# Match stats side by side
	var st_h: Dictionary = sm["stats"]["home"]
	var st_a: Dictionary = sm["stats"]["away"]
	var names: Dictionary = args.get("names", {"home": "Home", "away": "Away"})
	var rows: Array = [
		["Possession", "%d%%" % int(sm["possession_home"]), "%d%%" % (100 - int(sm["possession_home"]))],
		["Shots", str(int(st_h["shots"])), str(int(st_a["shots"]))],
		["On target", str(int(st_h["on_target"])), str(int(st_a["on_target"]))],
		["Corners", str(int(st_h["corners"])), str(int(st_a["corners"]))],
		["Fouls", str(int(st_h["fouls"])), str(int(st_a["fouls"]))],
		["Cards", "%dY %dR" % [int(st_h["yellows"]), int(st_h["reds"])], "%dY %dR" % [int(st_a["yellows"]), int(st_a["reds"])]],
	]
	var grid: GridContainer = GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_child(PsKit.fixed(str(names["home"]), 13, PsKit.GOLD))
	grid.add_child(PsKit.fixed("", 13))
	grid.add_child(PsKit.fixed(str(names["away"]), 13, PsKit.GOLD, HORIZONTAL_ALIGNMENT_RIGHT))
	for r in rows:
		var l1: Label = PsKit.fixed(str(r[1]), 14)
		l1.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(l1)
		var l2: Label = PsKit.fixed(str(r[0]), 13, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER)
		l2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(l2)
		var l3: Label = PsKit.fixed(str(r[2]), 14, PsKit.CREAM, HORIZONTAL_ALIGNMENT_RIGHT)
		l3.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(l3)
	var sp: PanelContainer = PsKit.panel(PsKit.PANEL)
	sp.add_child(grid)
	body.add_child(sp)

	# Man of the match and my ratings
	var mom: Dictionary = sm.get("mom", {})
	if not mom.is_empty():
		body.add_child(_card("Man of the match", "%s  %.1f  (%s)" % [mom["name"], float(mom["rating"]) / 100.0, names[mom["side"]]]))
	var rl: Array = []
	for r in sm.get("ratings", []):
		if r["side"] == my_side:
			var extra: String = ""
			if int(r["goals"]) > 0:
				extra += "  %d goal%s" % [int(r["goals"]), "" if int(r["goals"]) == 1 else "s"]
			if int(r["assists"]) > 0:
				extra += "  %d assist%s" % [int(r["assists"]), "" if int(r["assists"]) == 1 else "s"]
			if r["red"]:
				extra += "  sent off"
			rl.append("%.1f  %s (%s)%s" % [float(r["rating"]) / 100.0, r["name"], r["pos"], extra])
	if not rl.is_empty():
		body.add_child(_card("Your ratings", "\n".join(rl)))

	# Which cards paid off
	var by_tag: Dictionary = {}
	for ev in args["events"]:
		if ev["type"] == "shot" and ev["result"] == "goal" and ev["side"] == my_side and str(ev["tag"]) != "":
			by_tag[ev["tag"]] = int(by_tag.get(ev["tag"], 0)) + 1
	if not by_tag.is_empty():
		var parts: Array = []
		for k in by_tag:
			parts.append("%s: %d goal%s" % [k, by_tag[k], "" if by_tag[k] == 1 else "s"])
		body.add_child(_card("Your build paid off", "\n".join(parts)))

	# Money
	var money_lines: Array = []
	if int(sm["gate"]) > 0:
		money_lines.append("Gate  +%s" % PsKit.money(int(sm["gate"])))
	if int(sm["bonus"]) > 0:
		money_lines.append("Result bonus  +%s" % PsKit.money(int(sm["bonus"])))
	money_lines.append("Wages  -%s" % PsKit.money(int(sm["wages"])))
	money_lines.append("Balance  %s" % PsKit.money(int(app.st["club"]["money"])))
	body.add_child(_card("Money", "\n".join(money_lines)))

	if not sm["grown"].is_empty():
		var g: Array = []
		for x in sm["grown"]:
			g.append("%s +1 %s" % [x["name"], str(x["stat"]).to_upper()])
		body.add_child(_card("Training ground", ", ".join(g)))

	var others: Array = []
	for o in sm["others"]:
		others.append("%s %d - %d %s" % [o["home"], int(o["hg"]), int(o["ag"]), o["away"]])
	body.add_child(_card("Around the league", "\n".join(others)))

	var next_label: String = "Continue"
	if PsClub.is_season_over(app.st):
		next_label = "Season review"
	col.add_child(PsKit.btn(next_label, _next, "primary", 56))

func _card(title: String, text: String) -> Control:
	var p: PanelContainer = PsKit.panel(PsKit.PANEL)
	var v: VBoxContainer = PsKit.vbox(2)
	p.add_child(v)
	v.add_child(PsKit.lbl(title, 15, PsKit.GOLD))
	v.add_child(PsKit.lbl(text, 14, PsKit.CREAM))
	return p

func _next() -> void:
	app.sfx.play("click")
	if PsClub.is_season_over(app.st):
		app.go("season_end")
	else:
		app.go("hub")
