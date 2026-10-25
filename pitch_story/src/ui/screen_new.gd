class_name PsNewClubScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _name: LineEdit
var _color: int = 0
var _swatches: Array = []

func _ready() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(12)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 20
	col.offset_right = -20
	col.offset_top = 30
	col.offset_bottom = -20
	add_child(col)
	col.add_child(PsKit.lbl("Found your club", 30, PsKit.GOLD))
	col.add_child(PsKit.lbl("A muddy pitch, twenty hopefuls and a dream. Name your club and pick its colours.", 15, PsKit.DIM))
	col.add_child(PsKit.lbl("Club name", 16))
	_name = LineEdit.new()
	_name.text = "Dorpsclub United"
	_name.max_length = 22
	_name.custom_minimum_size = Vector2(0, 48)
	_name.add_theme_font_size_override("font_size", 20)
	col.add_child(_name)
	col.add_child(PsKit.lbl("Colours", 16))
	var row: HBoxContainer = PsKit.hbox(8)
	col.add_child(row)
	for i in PsClub.COLORS.size():
		var b: Button = Button.new()
		b.custom_minimum_size = Vector2(48, 48)
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(_pick.bind(i))
		row.add_child(b)
		_swatches.append(b)
	_pick(0)
	col.add_child(PsKit.spacer(0, true))
	col.add_child(PsKit.btn("Kick off!", _go, "primary", 56))
	col.add_child(PsKit.btn("Back", func() -> void: app.go("title"), "ghost", 40))

func _pick(i: int) -> void:
	_color = i
	for k in _swatches.size():
		var cols: Array = PsClub.COLORS[k]
		var sel: bool = k == i
		var sb: StyleBoxFlat = PsKit.box(cols[0], PsKit.GOLD if sel else PsKit.INK, 4 if sel else 3, 4 if sel else 3, 4)
		_swatches[k].add_theme_stylebox_override("normal", sb)
		_swatches[k].add_theme_stylebox_override("hover", sb)
		_swatches[k].add_theme_stylebox_override("pressed", sb)

func _go() -> void:
	var nm: String = _name.text.strip_edges()
	if nm == "":
		nm = "Dorpsclub United"
	app.sfx.play("whistle")
	app.start_new(nm, _color)
	app.go("hub")
