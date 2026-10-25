class_name PsTableScreen
extends Control

var app: PsApp
var args: Dictionary = {}

func _ready() -> void:
	var st: Dictionary = app.st
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
	col.add_child(PsKit.lbl("Village League  ·  season %d" % int(st["season"]["no"]), 24, PsKit.GOLD))
	var body: VBoxContainer = PsKit.vbox(4)
	col.add_child(PsKit.scroll(body))
	var grid: GridContainer = GridContainer.new()
	grid.columns = 7
	grid.add_theme_constant_override("h_separation", 8)
	body.add_child(grid)
	for h in ["#", "Club", "P", "W-D-L", "GD", "Pts", ""]:
		grid.add_child(PsKit.fixed(h, 12, PsKit.DIM))
	var rows: Array = PsClub.table_sorted(st)
	for i in rows.size():
		var r: Dictionary = rows[i]
		var me: bool = int(r["idx"]) == 0
		var c: Color = PsKit.GOLD if me else PsKit.CREAM
		grid.add_child(PsKit.fixed(str(i + 1), 14, c))
		var nm: Label = PsKit.lbl(str(r["name"]), 14, c)
		nm.autowrap_mode = TextServer.AUTOWRAP_OFF
		nm.clip_text = true
		nm.custom_minimum_size = Vector2(130, 0)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(nm)
		grid.add_child(PsKit.fixed(str(r["p"]), 14, c))
		grid.add_child(PsKit.fixed("%d-%d-%d" % [int(r["w"]), int(r["d"]), int(r["l"])], 14, c))
		grid.add_child(PsKit.fixed("%+d" % (int(r["gf"]) - int(r["ga"])), 14, c))
		grid.add_child(PsKit.fixed(str(r["pts"]), 14, c))
		grid.add_child(PsKit.fixed("*" if i == 0 and int(r["p"]) > 0 else "", 14, PsKit.GOLD))
	body.add_child(PsKit.spacer(8))
	body.add_child(PsKit.lbl("Your results", 18, PsKit.GOLD))
	if st["season"]["results"].is_empty():
		body.add_child(PsKit.lbl("No matches played yet.", 14, PsKit.DIM))
	for r in st["season"]["results"]:
		var tag: String = "W" if int(r["mg"]) > int(r["og"]) else ("D" if int(r["mg"]) == int(r["og"]) else "L")
		var tc: Color = PsKit.GRASS if tag == "W" else (PsKit.GOLD if tag == "D" else PsKit.RED)
		var line: HBoxContainer = PsKit.hbox(8)
		line.add_child(PsKit.fixed("%d" % int(r["day"]), 14, PsKit.DIM))
		line.add_child(PsKit.fixed(tag, 14, tc))
		var o: Label = PsKit.lbl("%s %s" % ["vs" if r["home"] else "at", r["opp"]], 14)
		o.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(o)
		line.add_child(PsKit.fixed("%d-%d" % [int(r["mg"]), int(r["og"])], 14, tc))
		body.add_child(line)
	col.add_child(PsKit.btn("Back", func() -> void: app.go("hub"), "primary", 46))
