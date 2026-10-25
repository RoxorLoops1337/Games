class_name PsTownView
extends Control
## The club's home ground, drawn in code on an 80x60 cell grid at an integer pixel scale.
## "Every number has a place in the town": each facility level, the fans and the club
## level change what is drawn here.

const GW: int = 80
const GH: int = 60

var st: Dictionary = {}
var t: float = 0.0
var _u: float = 4.0
var _ox: float = 0.0
var _oy: float = 0.0

func set_state(state: Dictionary) -> void:
	st = state
	queue_redraw()

func _process(delta: float) -> void:
	t += delta
	queue_redraw()

func _r(x: float, y: float, w: float, h: float, c: Color) -> void:
	draw_rect(Rect2(_ox + x * _u, _oy + y * _u, w * _u, h * _u), c)

func _tier() -> int:
	var lvl: int = PsClub.club_level(st)
	if lvl <= 2: return 0
	if lvl <= 5: return 1
	if lvl <= 9: return 2
	if lvl <= 13: return 3
	return 4

func _palette(tier: int) -> Dictionary:
	match tier:
		0: return {"sky": Color("9ec6d8"), "sky2": Color("c3dde4"), "hill": Color("7c9a6a"), "ground": Color("8f8a52"),
			"pitch": Color("6d9a48"), "pitch2": Color("628f40"), "mud": Color("7b6a40"), "line": Color("e6e2c8")}
		1: return {"sky": Color("86c5ea"), "sky2": Color("b9e0f3"), "hill": Color("5f9f62"), "ground": Color("5a9a4c"),
			"pitch": Color("57b05a"), "pitch2": Color("4fa553"), "mud": Color("6f8d4a"), "line": Color("f2f2e6")}
		2: return {"sky": Color("6fb4ea"), "sky2": Color("a8d8f5"), "hill": Color("4f9564"), "ground": Color("4a8f52"),
			"pitch": Color("43b56a"), "pitch2": Color("3aa862"), "mud": Color("5f8a50"), "line": Color("f7f7ef")}
		3: return {"sky": Color("3b4a8f"), "sky2": Color("e69a6a"), "hill": Color("2f6a58"), "ground": Color("2f7048"),
			"pitch": Color("38a45e"), "pitch2": Color("2f9654"), "mud": Color("4a7a4c"), "line": Color("f4f4ea")}
	return {"sky": Color("181d4a"), "sky2": Color("3a3f8a"), "hill": Color("1f4a52"), "ground": Color("246040"),
		"pitch": Color("2fa862"), "pitch2": Color("279a58"), "mud": Color("3a6e48"), "line": Color("fff7d0")}

func _draw() -> void:
	if st.is_empty():
		return
	var u: float = floorf(minf(size.x / GW, size.y / GH))
	_u = maxf(1.0, u)
	_ox = floorf((size.x - GW * _u) / 2.0)
	_oy = floorf((size.y - GH * _u) / 2.0)
	var tier: int = _tier()
	var pal: Dictionary = _palette(tier)
	var cols: Array = PsKit.club_colors(st)
	var main: Color = cols[0]
	var trim: Color = cols[1]
	var f: Dictionary = st["facilities"]
	var stand: int = int(f["stand"])
	var lights: int = int(f["lights"])
	var training: int = int(f["training"])
	var academy: int = int(f["academy"])
	var fans: float = clampf(float(PsClub.attendance(st)) / float(maxi(1, PsClub.stadium_capacity(st))), 0.0, 1.0)

	# Sky and hills. They run edge to edge so the diorama never shows a box on tall screens.
	draw_rect(Rect2(0, 0, size.x, size.y), pal["ground"])
	var sky_h: float = _oy + 8.0 * _u
	draw_rect(Rect2(0, 0, size.x, sky_h), pal["sky"])
	draw_rect(Rect2(0, sky_h, size.x, 7.0 * _u), pal["sky2"])
	if tier >= 3:
		for i in 14:
			_r((i * 37) % GW, (i * 11) % 9, 1, 1, Color(1, 1, 0.85, 0.5 + 0.5 * sin(t * 2.0 + i)))
	var cols_n: int = int(ceil(size.x / (2.0 * _u))) + 2
	var first: int = -int(ceil(_ox / (2.0 * _u))) - 1
	for i in range(first, first + cols_n):
		var hh: int = 3 + int(2.0 * sin(i * 0.45) + 1.5 * sin(i * 1.3))
		_r(i * 2, 15 - hh, 2, hh, pal["hill"])
	# Ground, with mud patches at small-club level
	draw_rect(Rect2(0, _oy + 15.0 * _u, size.x, size.y), pal["ground"])
	if tier <= 1:
		for i in 9:
			_r((i * 23 + 5) % 70 + 2, 17 + (i * 13) % 40, 4, 2, pal["mud"])

	# Clubhouse (always)
	_r(33, 7, 14, 9, Color("c9a27a"))
	_r(33, 7, 14, 2, main)
	_r(32, 6, 16, 2, trim)
	_r(38, 10, 4, 6, Color("5a3b2a"))
	_r(34, 10, 3, 3, Color("9fd3e8"))
	_r(43, 10, 3, 3, Color("9fd3e8"))
	_r(39.5, 3.5, 1, 3, Color("6b6b6b"))
	_r(40.5, 3.5, 4, 2, main)
	_r(41, 4, 1, 1, trim)

	# Pitch
	var px: int = 16
	var py: int = 25
	var pw: int = 48
	var ph: int = 24
	_r(px - 1, py - 1, pw + 2, ph + 2, pal["line"].darkened(0.1))
	for i in 8:
		_r(px + i * 6, py, 6, ph, pal["pitch"] if i % 2 == 0 else pal["pitch2"])
	if tier == 0:
		_r(px + 3, py + 4, 5, 3, pal["mud"])
		_r(px + 38, py + 15, 6, 3, pal["mud"])
		_r(px + 20, py + 9, 4, 2, pal["mud"])
	# Lines
	var ln: Color = pal["line"]
	_r(px, py, pw, 1, ln)
	_r(px, py + ph - 1, pw, 1, ln)
	_r(px, py, 1, ph, ln)
	_r(px + pw - 1, py, 1, ph, ln)
	_r(px + pw / 2 - 0.5, py, 1, ph, ln)
	_r(px + pw / 2 - 3, py + ph / 2 - 3, 6, 1, ln)
	_r(px + pw / 2 - 3, py + ph / 2 + 2, 6, 1, ln)
	_r(px + pw / 2 - 3, py + ph / 2 - 3, 1, 6, ln)
	_r(px + pw / 2 + 2, py + ph / 2 - 3, 1, 6, ln)
	_r(px, py + 7, 6, 1, ln)
	_r(px, py + ph - 8, 6, 1, ln)
	_r(px + 5, py + 7, 1, ph - 14, ln)
	_r(px + pw - 6, py + 7, 6, 1, ln)
	_r(px + pw - 6, py + ph - 8, 6, 1, ln)
	_r(px + pw - 6, py + 7, 1, ph - 14, ln)
	# Goals
	_r(px - 2, py + 9, 2, 6, Color("f4f4f4"))
	_r(px + pw, py + 9, 2, 6, Color("f4f4f4"))
	# Little players running about
	var tm: float = t * 1.3
	for i in 6:
		var rx: float = px + 6 + fposmod(i * 17.0 + tm * (3.0 + i * 0.4), pw - 12)
		var ry: float = py + 4 + (i * 7) % (ph - 8) + sin(tm * 2.0 + i) * 1.5
		var is_me: bool = i % 2 == 0
		_r(rx, ry, 2, 3, main if is_me else Color("e9e9e9"))
		_r(rx, ry - 1, 2, 1, Color("f0c9a0"))
	var bx: float = px + pw / 2.0 + sin(tm * 1.7) * 16.0
	var by: float = py + ph / 2.0 + cos(tm * 1.1) * 7.0
	_r(bx, by, 1.5, 1.5, Color("ffffff"))

	# Stands. Level 0 is a grass bank with a hedge; each level adds more stand.
	_draw_stand_north(stand, main, trim, fans, tier)
	if stand >= 2:
		_draw_stand_south(stand, main, trim, fans)
	if stand >= 3:
		_draw_stand_side(8, stand, main, trim, fans)
		_draw_stand_side(70, stand, main, trim, fans)
	# Floodlights
	_draw_lights(lights, tier)
	# Training ground (left) and academy (right)
	_draw_training(training, main, trim)
	_draw_academy(academy, main, trim)
	# Night glow
	if tier >= 3:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.1, 0.1, 0.3, 0.12 if tier == 3 else 0.2))

func _draw_stand_north(level: int, main: Color, trim: Color, fans: float, tier: int) -> void:
	var y: int = 17
	if level == 0:
		_r(14, 22, 52, 2, Color("3f7a3c"))
		_r(14, 21, 52, 1, Color("4f9248"))
		var n0: int = int(8.0 * fans)
		for i in n0:
			_r(17 + i * 6, 19.5 + (i % 2), 2, 2, main if i % 2 == 0 else trim)
		return
	var h: int = 6
	_r(14, y, 52, h, Color("55587a"))
	for row in 4:
		_r(14, y + 1 + row * 1.5, 52, 1, main if row % 2 == 0 else main.darkened(0.15))
	var seats: int = int(48.0 * fans)
	for i in seats:
		var row: int = i % 4
		var col: int = i / 4
		_r(15 + col * 4 + (row % 2), y + 0.5 + row * 1.5, 1.5, 1.5, [main, trim, Color("f2d6a8"), Color("c7a2e0")][(i * 7) % 4])
	if level >= 4:
		_r(12, y - 3, 56, 3, Color("d9dbe8"))
		_r(12, y - 3, 56, 1, Color("ffffff"))
	_r(14, y + h, 52, 1, Color("2b2d4a"))

func _draw_stand_south(level: int, main: Color, trim: Color, fans: float) -> void:
	var y: int = 50
	_r(14, y, 52, 5, Color("55587a"))
	for row in 3:
		_r(14, y + 0.5 + row * 1.5, 52, 1, main.darkened(0.1) if row % 2 == 0 else main)
	var seats: int = int(36.0 * fans)
	for i in seats:
		_r(15 + (i / 3) * 4 + (i % 3) % 2, y + 0.5 + (i % 3) * 1.5, 1.5, 1.5, [trim, main, Color("f2d6a8")][(i * 5) % 3])
	_r(14, y - 1, 52, 1, Color("2b2d4a"))
	if level >= 4:
		_r(12, y + 5, 56, 2, Color("d9dbe8"))

func _draw_stand_side(x: int, level: int, main: Color, trim: Color, fans: float) -> void:
	_r(x, 24, 6, 26, Color("55587a"))
	for col in 3:
		_r(x + 0.5 + col * 2, 24, 1, 26, main.darkened(0.1) if col % 2 == 0 else main)
	var n: int = int(20.0 * fans)
	for i in n:
		_r(x + 0.5 + (i % 3) * 2, 25 + (i / 3) * 3.4, 1.5, 1.5, trim if i % 2 == 0 else Color("f2d6a8"))

func _draw_lights(level: int, tier: int) -> void:
	if level <= 0:
		return
	var spots: Array = [[12, 23], [67, 23]]
	if level >= 2:
		spots += [[12, 50], [67, 50]]
	if level >= 3:
		spots += [[40, 22], [40, 51]]
	var glow: float = 0.55 + 0.1 * sin(t * 3.0)
	var night: bool = tier >= 3
	for s in spots:
		var x: float = s[0]
		var y: float = s[1]
		_r(x, y - 8, 1, 9, Color("8a8c9e"))
		_r(x - 1.5, y - 10, 4, 2, Color("d8d8e8"))
		var c: Color = Color(1.0, 0.95, 0.6, glow if night else 0.35)
		_r(x - 1, y - 9.5, 3, 1, c)
		if night:
			_r(x - 2, y - 6, 5, 6, Color(1, 0.95, 0.6, 0.035 * level))
			_r(x - 1, y - 5, 3, 4, Color(1, 0.95, 0.6, 0.035 * level))

func _draw_training(level: int, main: Color, trim: Color) -> void:
	var x: int = 1
	var y: int = 30
	_r(x, y, 11, 14, Color("4a8a46") if level > 0 else Color("6d7a42"))
	if level <= 0:
		_r(x + 2, y + 5, 3, 2, Color("5f6a38"))
		_r(x + 6, y + 9, 2, 2, Color("5f6a38"))
		return
	_r(x, y, 11, 1, Color("b8a37a"))
	_r(x, y + 13, 11, 1, Color("b8a37a"))
	for i in level + 1:
		_r(x + 2 + i * 2, y + 3, 1, 1.5, Color("ff8a2a"))
	var rx: float = x + 3 + fposmod(t * 3.0, 6.0)
	_r(rx, y + 7, 2, 3, main)
	_r(rx, y + 6, 2, 1, Color("f0c9a0"))
	if level >= 2:
		_r(x + 8, y + 2, 1, 5, Color("d0d0d8"))
		_r(x + 7, y + 2, 3, 1, Color("d0d0d8"))
	if level >= 3:
		_r(x + 1, y + 10, 4, 2, Color("c9c9d8"))
	if level >= 4:
		_r(x - 1, y - 1, 13, 1, Color("ffe08a"))

func _draw_academy(level: int, main: Color, trim: Color) -> void:
	var x: int = 69
	var y: int = 17
	if level <= 0:
		_r(x + 2, y + 14, 6, 3, Color("a08c64"))
		_r(x + 2, y + 13, 6, 1, Color("b9a47a"))
		return
	var floors: int = mini(level, 3)
	var h: int = 4 + floors * 3
	_r(x, y + 17 - h, 10, h, Color("d9b88a"))
	_r(x - 1, y + 16 - h, 12, 2, main)
	for fl in floors:
		_r(x + 1.5, y + 13 - fl * 3, 2, 2, Color("9fd3e8"))
		_r(x + 6.5, y + 13 - fl * 3, 2, 2, Color("9fd3e8"))
	_r(x + 4, y + 14, 2, 3, Color("5a3b2a"))
	_r(x + 9.5, y + 10 - h, 1, 5, Color("6b6b6b"))
	_r(x + 10.5, y + 10 - h, 3, 2, trim)
	if level >= 4:
		_r(x + 4, y + 17 - h - 2, 2, 2, Color("ffd34a"))
