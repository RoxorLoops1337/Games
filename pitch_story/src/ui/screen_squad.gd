class_name PsSquadScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _selected: int = -1
var _list: VBoxContainer
var _hint: Label
var _form_row: HBoxContainer
var _ment_row: HBoxContainer

func _ready() -> void:
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
	col.add_child(PsKit.lbl("Squad", 28, PsKit.GOLD))
	_form_row = PsKit.hbox(4)
	col.add_child(_form_row)
	_ment_row = PsKit.hbox(4)
	col.add_child(_ment_row)
	_hint = PsKit.lbl("", 13, PsKit.DIM)
	col.add_child(_hint)
	_list = PsKit.vbox(4)
	col.add_child(PsKit.scroll(_list))
	var row: HBoxContainer = PsKit.hbox(6)
	col.add_child(row)
	var auto: Button = PsKit.btn("Best XI", _auto, "normal", 46)
	auto.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(auto)
	var back: Button = PsKit.btn("Back", func() -> void: app.save(); app.go("hub"), "primary", 46)
	back.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(back)
	_rebuild()

func _is_starter(id: int) -> bool:
	for pos in PsPlayers.POS_ORDER:
		if app.st["lineup"][pos].has(id):
			return true
	return false

func _rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	var formation: String = PsClub.my_formation(app.st)
	app.st["lineup"] = PsPlayers.fix_lineup(app.st["squad"], app.st["lineup"], formation)
	for c in _form_row.get_children():
		c.queue_free()
	for f in PsFormations.LIST:
		var b: Button = PsKit.btn(f, _pick_formation.bind(f), "gold" if f == formation else "normal", 38)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_form_row.add_child(b)
	for c in _ment_row.get_children():
		c.queue_free()
	var cur: String = str(app.st.get("mentality", "balanced"))
	for m in PsMatchSim.MENTALITIES:
		var mb: Button = PsKit.btn(PsMatchSim.MENTALITY_LABEL[m], _pick_mentality.bind(m), "gold" if m == cur else "normal", 34)
		mb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_ment_row.add_child(mb)
	var xi: Array = PsPlayers.lineup_players(app.st["squad"], app.st["lineup"])
	var base: Dictionary = PsMatchSim.team_base(xi, formation)
	_hint.text = "%s  Team: attack %d, defence %d, tempo %d, stamina %d.  Tap a player, then a teammate in the same position to swap." % [PsFormations.BLURB[formation], base["atk"], base["def"], base["tmp"], base["sta"]]
	var last_pos: String = ""
	for p in PsClub.squad_sorted(app.st):
		if p["pos"] != last_pos:
			last_pos = str(p["pos"])
			_list.add_child(PsKit.lbl({"GK": "Goalkeepers", "DEF": "Defenders", "MID": "Midfielders", "FWD": "Forwards"}[last_pos] + "  (%d in the XI)" % PsFormations.count(formation, last_pos), 14, PsKit.pos_color(last_pos)))
		_list.add_child(_row(p))

func _pick_formation(f: String) -> void:
	app.sfx.play("click")
	PsClub.set_formation(app.st, f)
	_selected = -1
	_rebuild()

func _pick_mentality(m: String) -> void:
	app.sfx.play("click")
	app.st["mentality"] = m
	_rebuild()

func _row(p: Dictionary) -> Control:
	var id: int = int(p["id"])
	var starter: bool = _is_starter(id)
	var sel: bool = id == _selected
	var panel: PanelContainer = PsKit.panel(PsKit.PANEL_HI if sel else (PsKit.PANEL if starter else PsKit.INK_2), PsKit.GOLD if sel else PsKit.INK)
	var h: HBoxContainer = PsKit.hbox(6)
	panel.add_child(h)
	var badge: Label = PsKit.fixed("XI" if starter else "  ", 14, PsKit.GOLD)
	badge.custom_minimum_size = Vector2(22, 0)
	h.add_child(badge)
	var info: VBoxContainer = PsKit.vbox(0)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(info)
	var nm: Label = PsKit.lbl(str(p["name"]), 16, PsKit.CREAM)
	nm.autowrap_mode = TextServer.AUTOWRAP_OFF
	nm.clip_text = true
	info.add_child(nm)
	var tr: String = PsPlayers.TRAIT_LABEL.get(str(p["trait"]), "")
	var sub: String = "age %d" % int(p["age"])
	if tr != "":
		sub += " · " + tr
	if int(p["goals"]) > 0:
		sub += " · %d goals" % int(p["goals"])
	info.add_child(PsKit.lbl(sub, 12, PsKit.DIM))
	var stats: GridContainer = GridContainer.new()
	stats.columns = 4
	stats.add_theme_constant_override("h_separation", 6)
	for k in [["ATT", "att"], ["DEF", "def"], ["TMP", "tmp"], ["STA", "sta"]]:
		var cell: VBoxContainer = PsKit.vbox(0)
		cell.add_child(PsKit.fixed("%s %d" % [k[0], int(p[k[1]])], 11, PsKit.DIM))
		cell.add_child(PsKit.stat_bar(int(p[k[1]]), PsKit.pos_color(str(p["pos"]))))
		stats.add_child(cell)
	h.add_child(stats)
	var hit: Button = Button.new()
	hit.flat = true
	hit.focus_mode = Control.FOCUS_NONE
	hit.set_anchors_preset(Control.PRESET_FULL_RECT)
	hit.pressed.connect(_tap.bind(id))
	panel.add_child(hit)
	return panel

func _tap(id: int) -> void:
	app.sfx.play("click")
	if _selected < 0 or _selected == id:
		_selected = -1 if _selected == id else id
		_rebuild()
		return
	var a: Dictionary = PsPlayers.by_id(app.st["squad"], _selected)
	var b: Dictionary = PsPlayers.by_id(app.st["squad"], id)
	if a["pos"] == b["pos"] and _is_starter(_selected) != _is_starter(id):
		var starter_id: int = _selected if _is_starter(_selected) else id
		var bench_id: int = id if starter_id == _selected else _selected
		var arr: Array = app.st["lineup"][a["pos"]]
		arr[arr.find(starter_id)] = bench_id
		_selected = -1
		app.sfx.play("pick")
	else:
		_selected = id
	_rebuild()

func _auto() -> void:
	app.sfx.play("pick")
	app.st["lineup"] = PsPlayers.auto_lineup(app.st["squad"], PsClub.my_formation(app.st))
	_selected = -1
	_rebuild()
