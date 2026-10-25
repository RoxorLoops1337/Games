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

	# Scorers
	var my_side: String = str(args["my_side"])
	var mine: Array = []
	for sc in sm["scorers"]:
		if sc["side"] == my_side:
			mine.append("%s %d'" % [sc["name"], int(sc["min"])])
	if not mine.is_empty():
		body.add_child(_card("Your scorers", ", ".join(mine)))

	# Which cards paid off
	var by_tag: Dictionary = {}
	for ev in args["events"]:
		if ev["type"] == "goal" and ev["side"] == my_side and str(ev["tag"]) != "":
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
