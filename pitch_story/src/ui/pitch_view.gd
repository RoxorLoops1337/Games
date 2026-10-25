class_name PsPitchView
extends Control
## Top-down pitch with 22 numbered players. It only DISPLAYS match events: it moves the ball
## between the real players named in the event log and never changes the match.
## Home attacks to the right.

var forms: Dictionary = {"home": "4-4-2", "away": "4-4-2"}
var colors: Dictionary = {"home": Color("e8553d"), "away": Color("3d7be8")}
var names: Dictionary = {"home": [], "away": []}     # surnames by slot
var off: Dictionary = {"home": [], "away": []}       # sent-off slots
var t: float = 0.0
var ball: Vector2 = Vector2(0.5, 0.5)
var carrier_side: String = "home"
var carrier_slot: int = -1
var flash: float = 0.0
var flash_color: Color = Color.WHITE
var banner: String = ""
var banner_t: float = 0.0
var _from: Vector2 = Vector2(0.5, 0.5)
var _to: Vector2 = Vector2(0.5, 0.5)
var _t0: float = 0.0
var _dur: float = 0.01
var _lift: float = 0.0
var _trail: Array = []
var _moves: Dictionary = {}        # "side:slot" -> {off: Vector2, until: float}
var _cards: Dictionary = {}        # "side:slot" -> "yellow"/"red"
var _down: Dictionary = {}         # "side:slot" -> until
var _dive: Dictionary = {}         # "side:slot" -> {dir, until}
var _set_piece: String = ""

func setup(home_form: String, away_form: String, home_color: Color, away_color: Color, home_names: Array, away_names: Array) -> void:
	forms = {"home": home_form, "away": away_form}
	colors = {"home": home_color, "away": away_color}
	names = {"home": home_names, "away": away_names}
	off = {"home": [], "away": []}
	_cards.clear()

func set_player_name(side: String, slot: int, nm: String) -> void:
	names[side][slot] = nm

# ------------------------------------------------------------------ geometry

func _pitch_rect() -> Rect2:
	var w: float = size.x - 16.0
	var h: float = minf(size.y - 16.0, w * 0.7)
	return Rect2(8.0, floorf((size.y - h) / 2.0), w, h)

func _base_pos(side: String, slot: int) -> Vector2:
	var pts: Array = PsFormations.positions(str(forms[side]))
	var p: Array = pts[clampi(slot, 0, pts.size() - 1)]
	if side == "home":
		return Vector2(p[0], p[1])
	return Vector2(1.0 - float(p[0]), 1.0 - float(p[1]))

## Where a player stands right now (normalised): formation spot, squeezed toward the ball.
func dot(side: String, slot: int) -> Vector2:
	var b: Vector2 = _base_pos(side, slot)
	var key: String = "%s:%d" % [side, slot]
	if slot != 0:
		var shift: float = (_ball_now().x - 0.5) * 0.26
		b.x += shift
		# Wide players drift a little toward the ball's side of the pitch.
		b.y += (_ball_now().y - b.y) * 0.06
	if _moves.has(key) and float(_moves[key]["until"]) > t:
		b += _moves[key]["off"]
	if _dive.has(key) and float(_dive[key]["until"]) > t:
		b.y += float(_dive[key]["dir"]) * 0.07
	return b

func _ball_now() -> Vector2:
	var k: float = clampf((t - _t0) / _dur, 0.0, 1.0)
	k = k * k * (3.0 - 2.0 * k)
	return _from.lerp(_to, k)

func _px(p: Vector2) -> Vector2:
	var pr: Rect2 = _pitch_rect()
	return pr.position + Vector2(p.x * pr.size.x, p.y * pr.size.y)

# ------------------------------------------------------------------ animation

func _kick(to: Vector2, dur: float, lift: float = 0.0) -> void:
	_from = _ball_now()
	_to = to
	_t0 = t
	_dur = maxf(0.01, dur)
	_lift = lift

func _snap_ball_to(side: String, slot: int) -> void:
	var p: Vector2 = dot(side, slot)
	_from = p
	_to = p
	_t0 = t
	_dur = 0.01
	_lift = 0.0

func _flag(side: String, slot: int) -> void:
	carrier_side = side
	carrier_slot = slot

func _other(side: String) -> String:
	return "away" if side == "home" else "home"

## Start the animation for one event. Returns how long it takes (seconds at normal speed).
func animate(ev: Dictionary) -> float:
	var type: String = str(ev.get("type", ""))
	var side: String = str(ev.get("side", ""))
	var opp: String = _other(side)
	var slot: int = int(ev.get("slot", -1))
	var to: int = int(ev.get("to", -1))
	var by: int = int(ev.get("by", -1))
	_set_piece = ""
	match type:
		"kickoff":
			_from = Vector2(0.5, 0.5)
			_to = Vector2(0.5, 0.5)
			_t0 = t
			carrier_slot = -1
			return 0.9
		"halftime":
			carrier_slot = -1
			banner = "HALF TIME"
			banner_t = 1.2
			return 1.0
		"fulltime":
			carrier_slot = -1
			banner = "FULL TIME"
			banner_t = 1.6
			return 0.6
		"pass":
			_snap_ball_to(side, slot)
			var kind: String = str(ev.get("kind", "short"))
			var target: Vector2 = dot(side, to)
			var dur: float = 0.2 if kind == "short" or kind == "back" else (0.3 if kind == "prog" else 0.4)
			if bool(ev.get("ok", true)):
				_kick(target, dur, 0.05 if kind == "long" or kind == "cross" else 0.0)
				_flag(side, to)
			else:
				var catcher: Vector2 = dot(opp, by) if by >= 0 else target
				_kick(target.lerp(catcher, 0.7), dur)
				if by >= 0:
					_flag(opp, by)
				else:
					carrier_slot = -1
			return dur + 0.06
		"offside":
			_snap_ball_to(side, slot)
			_kick(dot(side, to), 0.4, 0.04)
			banner = "OFFSIDE"
			banner_t = 0.8
			carrier_slot = -1
			return 0.9
		"dribble":
			_snap_ball_to(side, slot)
			var dir: float = 1.0 if side == "home" else -1.0
			if bool(ev.get("ok", true)):
				var go: Vector2 = Vector2(0.07 * dir, (0.5 - dot(side, slot).y) * 0.12)
				_moves["%s:%d" % [side, slot]] = {"off": go, "until": t + 0.8}
				_kick(dot(side, slot) + go, 0.3)
				_flag(side, slot)
			else:
				var win: Vector2 = dot(opp, by) if by >= 0 else dot(side, slot)
				_moves["%s:%d" % [opp, by]] = {"off": (dot(side, slot) - win) * 0.7, "until": t + 0.6}
				_kick(dot(side, slot).lerp(win, 0.6), 0.28)
				if by >= 0:
					_flag(opp, by)
			return 0.4
		"shot":
			return _animate_shot(ev)
		"foul":
			_snap_ball_to(side, slot)
			_down["%s:%d" % [opp, to]] = t + 1.2
			banner = "FOUL"
			banner_t = 0.7
			var card: String = str(ev.get("card", ""))
			if card != "":
				_cards["%s:%d" % [side, slot]] = card
				banner = "RED CARD" if card == "red" else "YELLOW CARD"
				banner_t = 1.2
				if card == "red":
					off[side].append(slot)
			carrier_slot = -1
			return 1.0 if card == "" else 1.5
		"corner":
			var corner_y: float = 0.02 if dot(side, slot).y < 0.5 else 0.98
			var cx: float = 0.99 if side == "home" else 0.01
			_from = Vector2(cx, corner_y)
			_to = Vector2(cx, corner_y)
			_t0 = t
			_set_piece = "corner"
			banner = "CORNER"
			banner_t = 0.7
			carrier_slot = -1
			return 0.9
		"freekick":
			_snap_ball_to(side, slot)
			_set_piece = "freekick"
			banner = "FREE KICK"
			banner_t = 0.8
			carrier_slot = -1
			return 0.9
		"penalty":
			var px: float = 0.88 if side == "home" else 0.12
			_from = Vector2(px, 0.5)
			_to = Vector2(px, 0.5)
			_t0 = t
			_set_piece = "penalty"
			banner = "PENALTY"
			banner_t = 1.0
			carrier_slot = -1
			return 1.2
		"clearance":
			_snap_ball_to(side, slot)
			_kick(Vector2(0.5, ball.y), 0.35, 0.05)
			carrier_slot = -1
			return 0.45
		"sub", "injury":
			banner = "SUBSTITUTION" if type == "sub" else "INJURY"
			banner_t = 0.9
			return 0.8
	return 0.15

func _animate_shot(ev: Dictionary) -> float:
	var side: String = str(ev["side"])
	var opp: String = _other(side)
	var slot: int = int(ev["slot"])
	var gk: int = int(ev.get("gk", 0))
	var result: String = str(ev.get("result", "miss"))
	var goal_x: float = 1.0 if side == "home" else 0.0
	var inside: float = 0.015 if side == "home" else -0.015
	_snap_ball_to(side, slot)
	var kind: String = str(ev.get("kind", "foot"))
	if kind == "pen":
		_from = Vector2(0.88 if side == "home" else 0.12, 0.5)
		_to = _from
		_t0 = t
	var aim_y: float = 0.5 + (float(posmod(int(ev.get("t", 0)) / 7, 5)) - 2.0) * 0.045
	var dur: float = 0.4
	match result:
		"goal":
			_kick(Vector2(goal_x + inside, aim_y), dur, 0.04)
			_dive["%s:%d" % [opp, gk]] = {"dir": -1.0 if aim_y >= 0.5 else 1.0, "until": t + 1.0}
			flash = 1.0
			flash_color = colors[side]
			banner = "GOAL!"
			banner_t = 1.9
			carrier_slot = -1
			return 2.2
		"save":
			_kick(Vector2(goal_x - inside * 3.0, aim_y), dur)
			_dive["%s:%d" % [opp, gk]] = {"dir": 1.0 if aim_y >= 0.5 else -1.0, "until": t + 0.9}
			_flag(opp, gk)
			return 0.85
		"block":
			var by: int = int(ev.get("by", -1))
			var b: Vector2 = dot(opp, by) if by >= 0 else Vector2(goal_x * 0.85, 0.5)
			_kick(b, 0.3)
			if by >= 0:
				_flag(opp, by)
			return 0.55
	_kick(Vector2(goal_x + inside * 3.0, 0.5 + (0.28 if aim_y >= 0.5 else -0.28)), dur, 0.05)
	carrier_slot = -1
	return 0.75

# ------------------------------------------------------------------ drawing

func _process(delta: float) -> void:
	t += delta
	ball = _ball_now()
	if flash > 0.0:
		flash = maxf(0.0, flash - delta * 0.8)
	if banner_t > 0.0:
		banner_t -= delta
	_trail.append(ball)
	while _trail.size() > 7:
		_trail.pop_front()
	queue_redraw()

func _shirt(side: String, slot: int) -> Color:
	if slot == 0:
		return Color("f2c23a") if colors[side] != Color("f2c23a") else Color("2b2b3a")
	return colors[side]

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
	var bw: float = pr.size.x * 0.15
	var bh: float = pr.size.y * 0.55
	draw_rect(Rect2(pr.position.x, pr.position.y + (pr.size.y - bh) / 2.0, bw, bh), ln, false, 2.0)
	draw_rect(Rect2(pr.end.x - bw, pr.position.y + (pr.size.y - bh) / 2.0, bw, bh), ln, false, 2.0)
	var sw: float = pr.size.x * 0.06
	var sh: float = pr.size.y * 0.26
	draw_rect(Rect2(pr.position.x, pr.position.y + (pr.size.y - sh) / 2.0, sw, sh), ln, false, 2.0)
	draw_rect(Rect2(pr.end.x - sw, pr.position.y + (pr.size.y - sh) / 2.0, sw, sh), ln, false, 2.0)
	var gh: float = pr.size.y * 0.2
	draw_rect(Rect2(pr.position.x - 5, pr.position.y + (pr.size.y - gh) / 2.0, 5, gh), Color.WHITE)
	draw_rect(Rect2(pr.end.x, pr.position.y + (pr.size.y - gh) / 2.0, 5, gh), Color.WHITE)
	var f: Font = PsKit.font()
	# Players
	for side in ["home", "away"]:
		for slot in 11:
			if off[side].has(slot):
				continue
			var key: String = "%s:%d" % [side, slot]
			var p: Vector2 = _px(dot(side, slot))
			var col: Color = _shirt(side, slot)
			var down: bool = _down.has(key) and float(_down[key]) > t
			if down:
				draw_rect(Rect2(p - Vector2(7, 3), Vector2(14, 6)), PsKit.INK)
				draw_rect(Rect2(p - Vector2(6, 2), Vector2(12, 4)), col)
			else:
				draw_rect(Rect2(p - Vector2(6, 6), Vector2(12, 12)), PsKit.INK)
				draw_rect(Rect2(p - Vector2(5, 5), Vector2(10, 10)), col)
				draw_rect(Rect2(p - Vector2(2, 8), Vector2(4, 3)), Color("f0c9a0"))
				var num: String = str(slot + 1)
				var lum: float = col.get_luminance()
				draw_string(f, p + Vector2(-3.0 * num.length(), 4), num, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, PsKit.INK if lum > 0.55 else Color.WHITE)
			if _cards.has(key) and slot < names[side].size():
				var cc: Color = Color("f2c23a") if _cards[key] == "yellow" else Color("e8231d")
				draw_rect(Rect2(p + Vector2(4, -13), Vector2(5, 7)), cc)
	# Ball carrier ring and name
	if carrier_slot >= 0 and not off[carrier_side].has(carrier_slot):
		var cp: Vector2 = _px(dot(carrier_side, carrier_slot))
		draw_arc(cp, 10.0, 0, TAU, 16, Color.WHITE, 2.0)
		if carrier_slot < names[carrier_side].size():
			var nm: String = str(names[carrier_side][carrier_slot])
			var sz: Vector2 = f.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 11)
			var lp: Vector2 = Vector2(clampf(cp.x - sz.x / 2.0, 4.0, size.x - sz.x - 4.0), cp.y - 14.0)
			draw_rect(Rect2(lp - Vector2(2, 11), Vector2(sz.x + 4, 14)), Color(PsKit.INK, 0.8))
			draw_string(f, lp, nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, PsKit.CREAM)
	# Ball with a short trail
	for i in _trail.size():
		var tp: Vector2 = _px(_trail[i])
		draw_rect(Rect2(tp - Vector2(2, 2), Vector2(4, 4)), Color(1, 1, 1, 0.07 * float(i)))
	var k: float = clampf((t - _t0) / _dur, 0.0, 1.0)
	var lift_px: float = sin(k * PI) * _lift * pr.size.y
	var bp: Vector2 = _px(ball) - Vector2(0, lift_px)
	draw_rect(Rect2(_px(ball) - Vector2(3, 1), Vector2(6, 3)), Color(0, 0, 0, 0.3))
	draw_rect(Rect2(bp - Vector2(4, 4), Vector2(8, 8)), PsKit.INK)
	draw_rect(Rect2(bp - Vector2(3, 3), Vector2(6, 6)), Color.WHITE)
	if flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, size), Color(flash_color, flash * 0.3))
	if banner_t > 0.0:
		var fs: int = 40
		var sz2: Vector2 = f.get_string_size(banner, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
		var pos: Vector2 = Vector2((size.x - sz2.x) / 2.0, size.y / 2.0 + sz2.y / 4.0 - sin(minf(banner_t, 1.0) * 3.14) * 4.0)
		draw_string(f, pos + Vector2(0, 3), banner, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PsKit.INK)
		draw_string(f, pos, banner, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PsKit.GOLD)
