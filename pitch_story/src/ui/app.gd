class_name PsApp
extends Control
## Root of the game: owns the state, the save, the sound and the current screen.

const MAX_W: float = 520.0
const VERSION: String = "0.2.0"

var st: Dictionary = {}
var holder: Control
var screen: Control = null
var sfx: PsSfx
var toast_label: Label
var _toast_t: float = 0.0
var _bg: ColorRect
## ?preview=1..4 in the page URL shows a grown club in the hub. It never saves.
var preview_mode: bool = false

func _ready() -> void:
	theme = PsKit.make_theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg = ColorRect.new()
	_bg.color = PsKit.INK
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_bg)
	holder = Control.new()
	holder.clip_contents = true
	add_child(holder)
	sfx = PsSfx.new()
	add_child(sfx)
	toast_label = PsKit.lbl("", 16, PsKit.INK, HORIZONTAL_ALIGNMENT_CENTER)
	toast_label.add_theme_stylebox_override("normal", PsKit.box(PsKit.GOLD, PsKit.INK, 3, 3, 8))
	toast_label.visible = false
	toast_label.z_index = 100
	add_child(toast_label)
	resized.connect(_layout)
	_layout()
	_request_persistent_storage()
	var level: int = _preview_level()
	if level > 0:
		_start_preview(level)
	else:
		go("title")

func _layout() -> void:
	var w: float = minf(size.x, MAX_W)
	holder.position = Vector2(floorf((size.x - w) / 2.0), 0)
	holder.size = Vector2(w, size.y)
	toast_label.position = Vector2(holder.position.x + 12, size.y - 90)
	toast_label.size = Vector2(w - 24, 0)

func _process(delta: float) -> void:
	if _toast_t > 0.0:
		_toast_t -= delta
		if _toast_t <= 0.0:
			toast_label.visible = false

func toast(text: String) -> void:
	toast_label.text = text
	toast_label.visible = true
	toast_label.size = Vector2(holder.size.x - 24, 0)
	_toast_t = 2.2

func go(name: String, args: Dictionary = {}) -> void:
	if screen != null:
		screen.queue_free()
		screen = null
	var s: Control = null
	match name:
		"title": s = PsTitleScreen.new()
		"hub": s = PsHubScreen.new()
		"draft": s = PsDraftScreen.new()
		"squad": s = PsSquadScreen.new()
		"club": s = PsClubScreen.new()
		"table": s = PsTableScreen.new()
		"match": s = PsMatchScreen.new()
		"result": s = PsResultScreen.new()
		"season_end": s = PsSeasonEndScreen.new()
		"settings": s = PsSettingsScreen.new()
		"new": s = PsNewClubScreen.new()
	s.set("app", self)
	s.set("args", args)
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	holder.add_child(s)
	screen = s

func save() -> void:
	if st.is_empty() or preview_mode:
		return
	if not PsSave.write(st):
		toast("Could not save! Use Settings > Export.")

func start_new(club_name: String, color_idx: int) -> void:
	var seed_value: int = int(Time.get_unix_time_from_system()) ^ (Time.get_ticks_usec() & 0xFFFFFF)
	st = PsClub.new_game(seed_value, club_name, color_idx)
	save()

func load_save() -> bool:
	var r: Dictionary = PsSave.read()
	if not r["ok"]:
		toast(str(r["error"]))
		return false
	st = r["state"]
	if str(r["error"]) != "":
		toast(str(r["error"]))
	elif int(r["migrated_from"]) != PsClub.SCHEMA:
		toast("Save upgraded to the new version.")
	return true

## iOS Safari may wipe website storage after a week unused. Ask the browser to keep it.
func _request_persistent_storage() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if (navigator.storage && navigator.storage.persist) { navigator.storage.persist(); }", true)

func copy_text(text: String) -> void:
	DisplayServer.clipboard_set(text)
	if OS.has_feature("web"):
		# Browsers only allow clipboard writes inside a user gesture, so also try the JS route.
		var js: String = "if (navigator.clipboard) { navigator.clipboard.writeText(%s); }" % JSON.stringify(text)
		JavaScriptBridge.eval(js, true)

func _preview_level() -> int:
	if not OS.has_feature("web"):
		return 0
	var v: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('preview') || ''", true)
	var n: int = int(str(v))
	return clampi(n, 0, 4)

func _start_preview(level: int) -> void:
	preview_mode = true
	st = PsClub.new_game(7, "Preview FC", 1)
	for f in PsClub.FACILITIES:
		st["facilities"][f] = level
	st["club"]["fans"] = PsClub.stadium_capacity(st)
	st["club"]["money"] = 4200
	st["cards"] = ["wing_overload", "golden_boot", "set_pieces"]
	st["offer"] = []
	go("hub")
