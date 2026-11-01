class_name PsTitleScreen
extends Control

var app: PsApp
var args: Dictionary = {}

func _ready() -> void:
	var demo: Dictionary = PsClub.new_game(7, "Demo FC", 0)
	demo["facilities"] = {"stand": 3, "lights": 2, "training": 2, "academy": 1}
	demo["club"]["fans"] = 900
	var town: PsTownView = PsTownView.new()
	town.set_anchors_preset(Control.PRESET_FULL_RECT)
	town.set_state(demo)
	add_child(town)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(PsKit.INK, 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var col: VBoxContainer = PsKit.vbox(10)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 20
	col.offset_right = -20
	col.offset_top = 40
	col.offset_bottom = -24
	add_child(col)
	var t1: Label = PsKit.lbl("PITCH STORY", 44, PsKit.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	t1.add_theme_color_override("font_shadow_color", PsKit.INK)
	t1.add_theme_constant_override("shadow_offset_y", 4)
	col.add_child(t1)
	var t2: Label = PsKit.lbl("DRAFT DAY", 28, PsKit.CREAM, HORIZONTAL_ALIGNMENT_CENTER)
	t2.add_theme_color_override("font_shadow_color", PsKit.INK)
	t2.add_theme_constant_override("shadow_offset_y", 3)
	col.add_child(t2)
	col.add_child(PsKit.lbl("Grow a village club into champions.", 16, PsKit.CREAM, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(PsKit.spacer(0, true))
	if PsSave.has_save():
		col.add_child(PsKit.btn("Continue", _continue, "primary", 56))
		col.add_child(PsKit.btn("New club", _new, "normal", 46))
	else:
		col.add_child(PsKit.btn("Start a new club", _new, "primary", 56))
	col.add_child(PsKit.btn("Settings", func() -> void: _settings(), "ghost", 40))
	col.add_child(PsKit.lbl("v%s  ·  RoxorLoops & Jasmin" % PsApp.VERSION, 12, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER))

func _continue() -> void:
	app.sfx.play("click")
	if app.load_save():
		app.go("hub")

func _new() -> void:
	app.sfx.play("click")
	app.go("new")

func _settings() -> void:
	app.sfx.play("click")
	app.go("settings", {"back": "title"})
