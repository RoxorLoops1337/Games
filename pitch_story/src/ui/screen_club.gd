class_name PsClubScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _list: VBoxContainer
var _money: Label

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
	col.add_child(PsKit.lbl("Club", 28, PsKit.GOLD))
	_money = PsKit.lbl("", 18, PsKit.CREAM)
	col.add_child(_money)
	_list = PsKit.vbox(6)
	col.add_child(PsKit.scroll(_list))
	col.add_child(PsKit.btn("Back", func() -> void: app.save(); app.go("hub"), "primary", 46))
	_rebuild()

func _rebuild() -> void:
	for c in _list.get_children():
		c.queue_free()
	var st: Dictionary = app.st
	_money.text = "%s   ·   club level %d   ·   %d title%s" % [PsKit.money(int(st["club"]["money"])), PsClub.club_level(st), int(st["titles"]), "" if int(st["titles"]) == 1 else "s"]
	for f in PsClub.FACILITIES:
		var lvl: int = PsClub.facility(st, f)
		var p: PanelContainer = PsKit.panel(PsKit.PANEL)
		_list.add_child(p)
		var v: VBoxContainer = PsKit.vbox(3)
		p.add_child(v)
		var head: HBoxContainer = PsKit.hbox(6)
		v.add_child(head)
		var nm: Label = PsKit.lbl(str(PsClub.FAC_NAME[f]), 19, PsKit.GOLD)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(nm)
		var pips: HBoxContainer = PsKit.hbox(3)
		pips.alignment = BoxContainer.ALIGNMENT_CENTER
		for i in PsClub.FAC_MAX:
			var pip: ColorRect = ColorRect.new()
			pip.custom_minimum_size = Vector2(14, 14)
			pip.color = PsKit.GOLD if i < lvl else PsKit.INK_2
			pips.add_child(pip)
		head.add_child(pips)
		v.add_child(PsKit.lbl(str(PsClub.FAC_DESC[f]), 13, PsKit.DIM))
		if f == "stand":
			v.add_child(PsKit.lbl("Seats: %d  ·  fans: %d" % [PsClub.stadium_capacity(st), int(st["club"]["fans"])], 13, PsKit.CREAM))
		var cost: int = PsClub.upgrade_cost(st, f)
		if cost < 0:
			v.add_child(PsKit.lbl("Fully built.", 14, PsKit.GRASS))
		else:
			var b: Button = PsKit.btn("Upgrade for %s" % PsKit.money(cost), _upgrade.bind(f), "gold" if PsClub.can_upgrade(st, f) else "normal", 42)
			b.disabled = not PsClub.can_upgrade(st, f)
			v.add_child(b)
	var hall: PanelContainer = PsKit.panel(PsKit.INK_2)
	_list.add_child(hall)
	var hv: VBoxContainer = PsKit.vbox(2)
	hall.add_child(hv)
	hv.add_child(PsKit.lbl("Hall of fame", 18, PsKit.GOLD))
	if st["legends"].is_empty():
		hv.add_child(PsKit.lbl("Players who retire with 25 goals or 60 appearances become club legends.", 13, PsKit.DIM))
	for l in st["legends"]:
		hv.add_child(PsKit.lbl("%s  (%s)  ·  %d goals, %d games" % [l["name"], l["pos"], int(l["goals"]), int(l["apps"])], 14, PsKit.CREAM))

func _upgrade(f: String) -> void:
	if PsClub.upgrade(app.st, f):
		app.sfx.play("coin")
		app.save()
		_rebuild()
