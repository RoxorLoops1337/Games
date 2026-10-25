class_name PsPitchView
extends Control
## Top-down pitch with 22 players. It only DISPLAYS match events; it never changes the match.

const FORMATION: Array = [
	[0.05, 0.5],
	[0.22, 0.14], [0.2, 0.38], [0.2, 0.62], [0.22, 0.86],
	[0.44, 0.14], [0.42, 0.38], [0.42, 0.62], [0.44, 0.86],
	[0.66, 0.36], [0.66, 0.64],
]

var home_color: Color = Color("e8553d")
var away_color: Color = Color("3d7be8")
var t: float = 0.0
var ball: Vector2 = Vector2(0.5, 0.5)
var _path: Array = []          # [[Vector2 target, seconds], ...]
var _leg_t: float = 0.0
var _leg_from: Vector2 = Vector2(0.5, 0.5)
var attack_side: String = ""   # who has the ball right now
var flash: float = 0.0
var flash_color: Color = Color.WHITE
var banner: String = ""
var banner_t: float = 0.0
var crowd: float = 0.5

func _process(delta: float) -> void:
	t += delta
	if flash > 0.0:
		flash = maxf(0.0, flash - delta * 1.2)
	if banner_t > 0.0:
		banner_t -= delta
	if not _path.is_empty():
		var leg: Array = _path[0]
		_leg_t += delta
		var k: float = clampf(_leg_t / float(leg[1]), 0.0, 1.0)
		ball = _leg_from.lerp(leg[0], k)
		if k >= 1.0:
			_leg_from = leg[0]
			_leg_t = 0.0
			_path.pop_front()
	else:
		# Idle: the ball drifts around the middle third.
		var tx: float = 0.5 + (0.12 if attack_side == "home" else (-0.12 if attack_side == "away" else 0.0))
		ball = ball.lerp(Vector2(tx + sin(t * 0.9) * 0.1, 0.5 + cos(t * 1.3) * 0.18), clampf(delta * 1.5, 0.0, 1.0))
		_leg_from = ball
	queue_redraw()

## Show one match event. `home_attacks_right` is always true: home attacks the right goal.
func show_event(ev: Dictionary) -> void:
	var side: String = str(ev.get("side", ""))
	var type: String = str(ev.get("type", ""))
	if side == "" or type == "call":
		return
	attack_side = side
	var right: bool = side == "home"
	var gx: float = 1.0 if right else 0.0
	var sx: float = 0.84 if right else 0.16
	_path.clear()
	_leg_t = 0.0
	_leg_from = ball
	_path.append([Vector2(sx, 0.5 + sin(float(ev.get("pid", 1))) * 0.2), 0.35])
	match type:
		"goal":
			_path.append([Vector2(gx + (0.02 if right else -0.02), 0.5), 0.18])
			flash = 1.0
			flash_color = home_color if side == "home" else away_color
			banner = "GOAL!"
			banner_t = 1.4
		"save":
			_path.append([Vector2(gx - (0.05 if right else -0.05), 0.5), 0.2])
			_path.append([Vector2(gx - (0.2 if right else -0.2), 0.35), 0.25])
		"block":
			_path.append([Vector2(sx + (0.05 if right else -0.05), 0.5), 0.15])
			_path.append([Vector2(0.5, 0.4), 0.4])
		"miss":
			_path.append([Vector2(gx + (0.05 if right else -0.05), 0.18), 0.22])
			_path.append([Vector2(0.5, 0.6), 0.5])

func _pitch_rect() -> Rect2:
	var w: float = size.x - 16.0
	var h: float = minf(size.y - 16.0, w * 0.55)
	return Rect2(8.0, floorf((size.y - h) / 2.0), w, h)

func _draw() -> void:
	var pr: Rect2 = _pitch_rect()
	draw_rect(Rect2(Vector2.ZERO, size), Color("2a6a3a"))
	var stripes: int = 10
	for i in stripes:
		var c: Color = Color("3fae5a") if i % 2 == 0 else Color("37a352")
		draw_rect(Rect2(pr.position.x + pr.size.x / stripes * i, pr.position.y, pr.size.x / stripes + 1.0, pr.size.y), c)
	var ln: Color = Color(1, 1, 1, 0.85)
	draw_rect(pr, ln, false, 2.0)
	draw_line(pr.position + Vector2(pr.size.x / 2.0, 0), pr.position + Vector2(pr.size.x / 2.0, pr.size.y), ln, 2.0)
	draw_arc(pr.position + pr.size / 2.0, pr.size.y * 0.15, 0, TAU, 24, ln, 2.0)
	var bw: float = pr.size.x * 0.13
	var bh: float = pr.size.y * 0.5
	draw_rect(Rect2(pr.position.x, pr.position.y + (pr.size.y - bh) / 2.0, bw, bh), ln, false, 2.0)
	draw_rect(Rect2(pr.end.x - bw, pr.position.y + (pr.size.y - bh) / 2.0, bw, bh), ln, false, 2.0)
	var gh: float = pr.size.y * 0.2
	draw_rect(Rect2(pr.position.x - 5, pr.position.y + (pr.size.y - gh) / 2.0, 5, gh), Color.WHITE)
	draw_rect(Rect2(pr.end.x, pr.position.y + (pr.size.y - gh) / 2.0, 5, gh), Color.WHITE)
	# Players
	var shift: float = (ball.x - 0.5) * 0.28
	for side in ["home", "away"]:
		var col: Color = home_color if side == "home" else away_color
		for i in FORMATION.size():
			var f: Array = FORMATION[i]
			var x: float = f[0]
			if side == "away":
				x = 1.0 - x
			if i > 0:
				x += shift * (0.4 + float(i) * 0.05)
			var y: float = f[1] + sin(t * 1.4 + float(i) * 1.7 + (3.0 if side == "away" else 0.0)) * 0.025
			x += cos(t * 1.1 + float(i) * 2.3) * 0.012
			var p: Vector2 = pr.position + Vector2(x * pr.size.x, y * pr.size.y)
			draw_rect(Rect2(p - Vector2(5, 5), Vector2(10, 10)), PsKit.INK)
			draw_rect(Rect2(p - Vector2(4, 4), Vector2(8, 8)), col)
			draw_rect(Rect2(p - Vector2(2, 7), Vector2(4, 3)), Color("f0c9a0"))
	var bp: Vector2 = pr.position + Vector2(ball.x * pr.size.x, ball.y * pr.size.y)
	draw_rect(Rect2(bp - Vector2(4, 4), Vector2(8, 8)), PsKit.INK)
	draw_rect(Rect2(bp - Vector2(3, 3), Vector2(6, 6)), Color.WHITE)
	if flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, size), Color(flash_color, flash * 0.35))
	if banner_t > 0.0:
		var f2: Font = PsKit.font()
		var txt: String = banner
		var fs: int = 44
		var sz: Vector2 = f2.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
		var pos: Vector2 = Vector2((size.x - sz.x) / 2.0, size.y / 2.0 + sz.y / 4.0 - sin(minf(banner_t, 1.0) * 3.14) * 4.0)
		draw_string(f2, pos + Vector2(0, 3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PsKit.INK)
		draw_string(f2, pos, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PsKit.GOLD)
