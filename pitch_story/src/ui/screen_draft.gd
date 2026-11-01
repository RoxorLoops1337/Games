class_name PsDraftScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _sel: int = -1
var _panels: Array = []
var _take: Button

func _ready() -> void:
	var st: Dictionary = app.st
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(8)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 12
	col.offset_right = -12
	col.offset_top = 12
	col.offset_bottom = -12
	add_child(col)
	var block: int = PsClub.block_of_day(int(st["season"]["day"]))
	col.add_child(PsKit.lbl("Block %d draft" % (block + 1), 28, PsKit.GOLD))
	col.add_child(PsKit.lbl("Pick one card. It stays with you for the rest of the season. Cards that share a tag build a synergy.", 14, PsKit.DIM))
	var list: VBoxContainer = PsKit.vbox(8)
	col.add_child(PsKit.scroll(list))
	for i in st["offer"].size():
		var card: Dictionary = PsCards.get_card(str(st["offer"][i]))
		var p: PanelContainer = PsKit.panel(PsKit.PANEL)
		list.add_child(p)
		_panels.append(p)
		var v: VBoxContainer = PsKit.vbox(3)
		p.add_child(v)
		var head: HBoxContainer = PsKit.hbox(6)
		v.add_child(head)
		var nm: Label = PsKit.lbl(str(card["name"]), 20, PsKit.GOLD if int(card["rarity"]) >= 2 else PsKit.CREAM)
		nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(nm)
		if int(card["rarity"]) >= 2:
			head.add_child(PsKit.fixed("RARE", 14, PsKit.GOLD))
		v.add_child(PsKit.lbl(str(card["desc"]), 15, PsKit.CREAM))
		v.add_child(PsKit.lbl("Tags: " + ", ".join(card["tags"]), 13, PsKit.DIM))
		var syn: String = _synergy_hint(st, str(card["id"]))
		if syn != "":
			v.add_child(PsKit.lbl(syn, 14, PsKit.GRASS))
		var hit: Button = Button.new()
		hit.flat = true
		hit.focus_mode = Control.FOCUS_NONE
		hit.set_anchors_preset(Control.PRESET_FULL_RECT)
		hit.pressed.connect(_select.bind(i))
		p.add_child(hit)
	if not st["cards"].is_empty():
		var names: Array = []
		for id in st["cards"]:
			names.append(PsCards.get_card(str(id)).get("name", "?"))
		col.add_child(PsKit.lbl("Your cards: " + ", ".join(names), 13, PsKit.DIM))
	_take = PsKit.btn("Choose a card", _confirm, "primary", 56)
	_take.disabled = true
	col.add_child(_take)
	_refresh()

func _synergy_hint(st: Dictionary, id: String) -> String:
	var before: Array = PsCards.synergies(st["cards"])
	var after_cards: Array = st["cards"].duplicate()
	after_cards.append(id)
	var after: Array = PsCards.synergies(after_cards)
	for a in after:
		var existed: bool = false
		for b in before:
			if b["tag"] == a["tag"] and b["mult"] == a["mult"]:
				existed = true
		if not existed:
			return "Synergy unlocked: %s" % a["label"]
	return ""

func _select(i: int) -> void:
	app.sfx.play("click")
	_sel = i
	_refresh()

func _refresh() -> void:
	for i in _panels.size():
		var on: bool = i == _sel
		_panels[i].add_theme_stylebox_override("panel", PsKit.box(PsKit.PANEL_HI if on else PsKit.PANEL, PsKit.GOLD if on else PsKit.INK, 4 if on else 3, 4 if on else 3, 8))
	_take.disabled = _sel < 0
	if _sel >= 0:
		_take.text = "Take %s" % PsCards.get_card(str(app.st["offer"][_sel]))["name"]

func _confirm() -> void:
	if _sel < 0:
		return
	if PsClub.pick_card(app.st, str(app.st["offer"][_sel])):
		app.sfx.play("pick")
		app.save()
		app.go("hub")
