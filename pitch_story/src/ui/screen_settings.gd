class_name PsSettingsScreen
extends Control

var app: PsApp
var args: Dictionary = {}
var _box: TextEdit
var _msg: Label

func _ready() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(10)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 16
	col.offset_right = -16
	col.offset_top = 16
	col.offset_bottom = -16
	add_child(col)
	col.add_child(PsKit.lbl("Settings", 28, PsKit.GOLD))
	var snd: Button = PsKit.btn("Sound: " + ("off" if app.sfx.muted else "on"), func() -> void: pass, "normal", 44)
	snd.pressed.connect(func() -> void:
		app.sfx.muted = not app.sfx.muted
		snd.text = "Sound: " + ("off" if app.sfx.muted else "on")
		app.sfx.play("click"))
	col.add_child(snd)
	col.add_child(PsKit.lbl("Save backup", 18, PsKit.CREAM))
	col.add_child(PsKit.lbl("Browsers can wipe game data. Export your save as text and keep it somewhere safe. Paste it below and press Import to restore.", 13, PsKit.DIM))
	_box = TextEdit.new()
	_box.custom_minimum_size = Vector2(0, 110)
	_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_box.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_box.placeholder_text = "Save text appears here, or paste a save to import."
	col.add_child(_box)
	var row: HBoxContainer = PsKit.hbox(8)
	col.add_child(row)
	var ex: Button = PsKit.btn("Export", _export, "normal", 44)
	ex.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(ex)
	var im: Button = PsKit.btn("Import", _import, "normal", 44)
	im.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(im)
	var cp: Button = PsKit.btn("Copy", _copy, "normal", 44)
	cp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(cp)
	_msg = PsKit.lbl("", 14, PsKit.GOLD)
	col.add_child(_msg)
	var reset: Button = PsKit.btn("Delete save and start over", _reset, "danger", 40)
	col.add_child(reset)
	col.add_child(PsKit.btn("Back", _back, "primary", 48))

func _back() -> void:
	app.sfx.play("click")
	app.go(str(args.get("back", "title")))

func _export() -> void:
	if app.st.is_empty():
		_msg.text = "Nothing to export yet. Start a club first."
		return
	_box.text = Marshalls.utf8_to_base64(PsSave.encode(app.st))
	_msg.text = "Exported. Copy it and keep it safe."

func _copy() -> void:
	if _box.text == "":
		_export()
	app.copy_text(_box.text)
	_msg.text = "Copied to the clipboard."

func _import() -> void:
	var raw: String = _box.text.strip_edges()
	if raw == "":
		_msg.text = "Paste a save first."
		return
	var text: String = raw
	if not raw.begins_with("{"):
		# Only decode text that really is base64; garbage should fail politely, not log engine errors.
		var re: RegEx = RegEx.new()
		re.compile("^[A-Za-z0-9+/=\\s]+$")
		var clean: String = raw.replace("\n", "").replace("\r", "").replace(" ", "")
		if re.search(raw) == null or clean.length() % 4 != 0:
			_msg.text = "Import failed: that does not look like a save."
			return
		text = Marshalls.base64_to_utf8(clean)
	var r: Dictionary = PsSave.decode(text)
	if not r["ok"]:
		_msg.text = "Import failed: " + str(r["error"])
		return
	app.st = r["state"]
	app.save()
	_msg.text = "Imported!"
	app.sfx.play("coin")
	app.go("hub")

func _reset() -> void:
	if _msg.text != "Press again to delete the save for good.":
		_msg.text = "Press again to delete the save for good."
		return
	PsSave.wipe()
	app.st = {}
	app.go("title")
