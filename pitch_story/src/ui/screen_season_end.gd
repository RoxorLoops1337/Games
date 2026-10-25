class_name PsSeasonEndScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _keep: String = ""
var _col: VBoxContainer

func _ready() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	_col = PsKit.vbox(8)
	_col.set_anchors_preset(Control.PRESET_FULL_RECT)
	_col.offset_left = 12
	_col.offset_right = -12
	_col.offset_top = 12
	_col.offset_bottom = -12
	add_child(_col)
	_phase_review()

func _clear() -> void:
	for c in _col.get_children():
		c.queue_free()

func _phase_review() -> void:
	_clear()
	var st: Dictionary = app.st
	var pos: int = PsClub.position(st)
	var champ: bool = pos == 1
	_col.add_child(PsKit.lbl("Season %d complete" % int(st["season"]["no"]), 26, PsKit.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	_col.add_child(PsKit.lbl("CHAMPIONS!" if champ else "Finished %d%s" % [pos, "th" if pos > 3 else ["", "st", "nd", "rd"][pos]], 40, PsKit.GOLD if champ else PsKit.CREAM, HORIZONTAL_ALIGNMENT_CENTER))
	app.sfx.play("win" if champ else "pick")
	var rows: Array = PsClub.table_sorted(st)
	var top: Array = []
	for i in mini(3, rows.size()):
		top.append("%d. %s  (%d pts)" % [i + 1, rows[i]["name"], int(rows[i]["pts"])])
	_col.add_child(PsKit.lbl("\n".join(top), 15, PsKit.CREAM, HORIZONTAL_ALIGNMENT_CENTER))
	var prize: int = PsClub.season_prize(st)
	_col.add_child(PsKit.lbl("Prize money: %s" % PsKit.money(prize), 18, PsKit.GRASS, HORIZONTAL_ALIGNMENT_CENTER))
	if champ:
		_col.add_child(PsKit.lbl("The town throws a parade. Fans +25%.", 14, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER))
	_col.add_child(PsKit.spacer(4))
	_col.add_child(PsKit.lbl("Keep one card for next season", 18, PsKit.GOLD))
	_col.add_child(PsKit.lbl("Your other cards are shuffled back. This one stays as your club's identity.", 13, PsKit.DIM))
	var list: VBoxContainer = PsKit.vbox(4)
	_col.add_child(PsKit.scroll(list))
	if st["cards"].is_empty():
		list.add_child(PsKit.lbl("You drafted no cards.", 14, PsKit.DIM))
	else:
		_keep = str(st["cards"][0])
	var buttons: Array = []
	for id in st["cards"]:
		var card: Dictionary = PsCards.get_card(str(id))
		var b: Button = PsKit.btn("%s: %s" % [card["name"], card["desc"]], func() -> void: pass, "normal", 52)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_font_size_override("font_size", 14)
		b.pressed.connect(func() -> void:
			_keep = str(id)
			app.sfx.play("click")
			_mark(buttons))
		list.add_child(b)
		buttons.append([id, b])
	_mark(buttons)
	_col.add_child(PsKit.btn("Start season %d" % (int(st["season"]["no"]) + 1), _start_next, "primary", 56))

func _mark(buttons: Array) -> void:
	for pair in buttons:
		PsKit.style_button(pair[1], "gold" if str(pair[0]) == _keep else "normal")

func _start_next() -> void:
	app.sfx.play("whistle")
	var rep: Dictionary = PsClub.end_season(app.st, _keep)
	app.save()
	_clear()
	_col.add_child(PsKit.lbl("A new season", 30, PsKit.GOLD, HORIZONTAL_ALIGNMENT_CENTER))
	var lines: Array = []
	if not rep["retired"].is_empty():
		lines.append("Retired: " + ", ".join(rep["retired"]))
	if not rep["joined"].is_empty():
		lines.append("Joined: " + ", ".join(rep["joined"]))
	lines.append("Everyone is a year older. The young improve, the old slow down. Rivals are stronger now.")
	if not app.st["legends"].is_empty():
		lines.append("Club legends so far: %d" % app.st["legends"].size())
	var body: Label = PsKit.lbl("\n\n".join(lines), 15, PsKit.CREAM)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_col.add_child(body)
	_col.add_child(PsKit.btn("To the club", func() -> void: app.go("hub"), "primary", 56))
