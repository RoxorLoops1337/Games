class_name PsKit
extends RefCounted
## Shared look: palette, theme, small widget helpers. Everything is drawn in code.

const INK := Color("23243a")
const INK_2 := Color("2f3150")
const PANEL := Color("3a3f66")
const PANEL_HI := Color("4d5486")
const CREAM := Color("fff4e0")
const DIM := Color("b9bcdc")
const GRASS := Color("5fb35f")
const GRASS_DK := Color("3f8a46")
const GOLD := Color("f2c23a")
const RED := Color("e8553d")
const BLUE := Color("5b8def")
const FONT_PATH := "res://assets/fonts/PixelifySans.ttf"

static var _font: Font = null

static func font() -> Font:
	if _font == null:
		_font = load(FONT_PATH)
	return _font

static func _box(bg: Color, border: Color, bw: int = 3, bottom: int = 5, pad: int = 8) -> StyleBoxFlat:
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.border_width_bottom = bottom
	s.set_corner_radius_all(0)
	s.anti_aliasing = false
	s.content_margin_left = pad
	s.content_margin_right = pad
	s.content_margin_top = pad - 2
	s.content_margin_bottom = pad - 2 + (bottom - bw)
	return s

static func box(bg: Color, border: Color = INK, bw: int = 3, bottom: int = 3, pad: int = 8) -> StyleBoxFlat:
	return _box(bg, border, bw, bottom, pad)

static func make_theme() -> Theme:
	var t: Theme = Theme.new()
	t.default_font = font()
	t.default_font_size = 16
	t.set_color("font_color", "Label", CREAM)
	t.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0.35))
	t.set_constant("shadow_offset_x", "Label", 0)
	t.set_constant("shadow_offset_y", "Label", 2)
	for name in ["Button"]:
		t.set_stylebox("normal", name, _box(PANEL, INK, 3, 6))
		t.set_stylebox("hover", name, _box(PANEL_HI, INK, 3, 6))
		t.set_stylebox("pressed", name, _box(PANEL_HI, INK, 3, 3))
		t.set_stylebox("disabled", name, _box(INK_2, INK, 3, 3))
		t.set_stylebox("focus", name, StyleBoxEmpty.new())
		t.set_color("font_color", name, CREAM)
		t.set_color("font_hover_color", name, CREAM)
		t.set_color("font_pressed_color", name, CREAM)
		t.set_color("font_disabled_color", name, Color(CREAM, 0.4))
		t.set_font_size("font_size", name, 18)
	t.set_stylebox("panel", "PanelContainer", _box(PANEL, INK, 3, 3, 8))
	t.set_stylebox("normal", "LineEdit", _box(INK_2, INK, 3, 3, 8))
	t.set_stylebox("focus", "LineEdit", _box(INK_2, GOLD, 3, 3, 8))
	t.set_color("font_color", "LineEdit", CREAM)
	t.set_stylebox("normal", "TextEdit", _box(INK_2, INK, 3, 3, 8))
	t.set_stylebox("focus", "TextEdit", _box(INK_2, GOLD, 3, 3, 8))
	t.set_color("font_color", "TextEdit", CREAM)
	return t

static func style_button(b: Button, kind: String) -> void:
	var bg: Color = PANEL
	match kind:
		"primary": bg = Color("3f9a52")
		"gold": bg = Color("c99a22")
		"danger": bg = Color("b84632")
		"ghost": bg = Color(INK_2, 0.6)
	var hi: Color = bg.lightened(0.15)
	b.add_theme_stylebox_override("normal", _box(bg, INK, 3, 6))
	b.add_theme_stylebox_override("hover", _box(hi, INK, 3, 6))
	b.add_theme_stylebox_override("pressed", _box(hi, INK, 3, 3))

static func btn(text: String, cb: Callable, kind: String = "normal", min_h: int = 46) -> Button:
	var b: Button = Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, min_h)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	if kind != "normal":
		style_button(b, kind)
	return b

static func lbl(text: String, size: int = 16, color: Color = CREAM, align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = align as HorizontalAlignment
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

## A label that never wraps. Use it for short values that share a row with expanding content,
## otherwise the row squeezes them to one character per line.
static func fixed(text: String, size: int = 16, color: Color = CREAM, align: int = HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l: Label = lbl(text, size, color, align)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	return l

static func panel(bg: Color = PANEL, border: Color = INK) -> PanelContainer:
	var p: PanelContainer = PanelContainer.new()
	p.add_theme_stylebox_override("panel", _box(bg, border, 3, 3, 8))
	return p

static func vbox(sep: int = 6) -> VBoxContainer:
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v

static func hbox(sep: int = 6) -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h

static func spacer(h: int = 0, expand: bool = false) -> Control:
	var c: Control = Control.new()
	c.custom_minimum_size = Vector2(0, h)
	if expand:
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c

static func scroll(child: Control) -> ScrollContainer:
	var s: ScrollContainer = ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.size_flags_vertical = Control.SIZE_EXPAND_FILL
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	child.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.add_child(child)
	return s

static func money(n: int) -> String:
	var neg: bool = n < 0
	var s: String = str(absi(n))
	var out: String = ""
	var c: int = 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		c += 1
		if c % 3 == 0 and i > 0:
			out = "," + out
	return ("-" if neg else "") + "$" + out

static func club_colors(st: Dictionary) -> Array:
	return PsClub.COLORS[int(st["club"]["color"]) % PsClub.COLORS.size()]

static func pos_color(pos: String) -> Color:
	match pos:
		"GK": return Color("f2c23a")
		"DEF": return Color("5b8def")
		"MID": return Color("5fb35f")
	return Color("e8553d")

static func stat_bar(v: int, color: Color = GRASS) -> Control:
	var c: ColorRect = ColorRect.new()
	c.custom_minimum_size = Vector2(maxi(2, (v - 20) * 56 / 75), 6)
	c.color = color
	return c
