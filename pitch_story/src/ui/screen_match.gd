class_name PsMatchScreen
extends Control
## Plays one match day. The sim runs a minute at a time; this screen plays its events one by one
## (the ball visibly moving between the named players) and only DISPLAYS them.
## At minutes 30, 45 (half time) and 65 the game pauses for a team talk: mentality and substitutions.

const BASE_PACE: float = 1.0       # seconds of animation per event at 1x are set by the pitch view

var app: PsApp
var args: Dictionary = {}
var sim: PsMatchSim
var fx: Dictionary
var my_side: String = "home"
var pitch: PsPitchView
var score_l: Label
var minute_l: Label
var feed: RichTextLabel
var stats_l: Label
var poss_bar: Control
var talk: PanelContainer
var speed_btn: Button
var skip_btn: Button
var done_btn: Button
var _lines: Array = []
var _queue: Array = []
var _wait: float = 0.0
var _speed: int = 2
var _asked: Array = []
var _talking: bool = false
var _ended: bool = false
var _names: Dictionary = {}
var _score: Array = [0, 0]
var _shots: Dictionary = {"home": 0, "away": 0}
var _sot: Dictionary = {"home": 0, "away": 0}
var _touch: Dictionary = {"home": 1, "away": 1}
var _pending_slot: int = -1

func _ready() -> void:
	var st: Dictionary = app.st
	fx = PsClub.my_fixture(st)
	my_side = "home" if fx["me_home"] else "away"
	var home_cfg: Dictionary = PsClub.team_cfg(st, int(fx["home"]), int(fx["home"]) == 0)
	var away_cfg: Dictionary = PsClub.team_cfg(st, int(fx["away"]), int(fx["away"]) == 0)
	sim = PsMatchSim.create(PsClub.match_seed(st), home_cfg, away_cfg)
	_names = {"home": str(home_cfg["name"]), "away": str(away_cfg["name"])}
	var bg: ColorRect = ColorRect.new()
	bg.color = PsKit.INK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col: VBoxContainer = PsKit.vbox(4)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 6
	col.offset_right = -6
	col.offset_top = 6
	col.offset_bottom = -6
	add_child(col)

	var board: PanelContainer = PsKit.panel(PsKit.PANEL)
	col.add_child(board)
	var bv: VBoxContainer = PsKit.vbox(0)
	board.add_child(bv)
	var teams: HBoxContainer = PsKit.hbox(4)
	bv.add_child(teams)
	var hn: Label = PsKit.lbl("%s  %s" % [_names["home"], str(home_cfg["formation"])], 14, PsKit.CREAM)
	hn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hn.autowrap_mode = TextServer.AUTOWRAP_OFF
	hn.clip_text = true
	teams.add_child(hn)
	var an: Label = PsKit.lbl("%s  %s" % [str(away_cfg["formation"]), _names["away"]], 14, PsKit.CREAM, HORIZONTAL_ALIGNMENT_RIGHT)
	an.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	an.autowrap_mode = TextServer.AUTOWRAP_OFF
	an.clip_text = true
	teams.add_child(an)
	score_l = PsKit.lbl("0 - 0", 36, PsKit.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	bv.add_child(score_l)
	minute_l = PsKit.lbl("Kick off", 13, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	bv.add_child(minute_l)
	poss_bar = Control.new()
	poss_bar.custom_minimum_size = Vector2(0, 8)
	poss_bar.draw.connect(_draw_poss)
	bv.add_child(poss_bar)
	stats_l = PsKit.lbl("", 12, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	bv.add_child(stats_l)

	pitch = PsPitchView.new()
	pitch.custom_minimum_size = Vector2(0, 150)
	pitch.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pitch.clip_contents = true
	var mine: Color = PsKit.club_colors(st)[0]
	var theirs: Color = PsClub.COLORS[(int(st["club"]["color"]) + 2 + int(fx["opp"])) % PsClub.COLORS.size()][0]
	if theirs == mine:
		theirs = Color("e9e9e9")
	var hnames: Array = []
	var anames: Array = []
	for p in home_cfg["xi"]:
		hnames.append(PsKit.surname(str(p["name"])))
	for p in away_cfg["xi"]:
		anames.append(PsKit.surname(str(p["name"])))
	pitch.setup(str(home_cfg["formation"]), str(away_cfg["formation"]), mine if my_side == "home" else theirs,
		theirs if my_side == "home" else mine, hnames, anames)
	col.add_child(pitch)

	feed = RichTextLabel.new()
	feed.bbcode_enabled = true
	feed.fit_content = false
	feed.scroll_active = false
	feed.custom_minimum_size = Vector2(0, 118)
	feed.add_theme_font_size_override("normal_font_size", 13)
	feed.add_theme_font_size_override("bold_font_size", 13)
	col.add_child(feed)

	var row: HBoxContainer = PsKit.hbox(6)
	col.add_child(row)
	speed_btn = PsKit.btn("Speed x2", _toggle_speed, "normal", 42)
	speed_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(speed_btn)
	skip_btn = PsKit.btn("Skip to end", _skip, "ghost", 42)
	skip_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(skip_btn)
	done_btn = PsKit.btn("Full time: continue", _finish, "primary", 50)
	done_btn.visible = false
	col.add_child(done_btn)

	talk = PsKit.panel(PsKit.PANEL, PsKit.GOLD)
	talk.visible = false
	talk.set_anchors_preset(Control.PRESET_FULL_RECT)
	talk.offset_left = 8
	talk.offset_right = -8
	talk.offset_top = 70
	talk.offset_bottom = -8
	add_child(talk)
	_wait = 0.8
	app.sfx.play("whistle")
	_refresh_stats()

func _draw_poss() -> void:
	var w: float = poss_bar.size.x
	var a: float = float(_touch["home"])
	var b: float = float(_touch["away"])
	var k: float = a / maxf(1.0, a + b)
	var hc: Color = pitch.colors["home"]
	var ac: Color = pitch.colors["away"]
	poss_bar.draw_rect(Rect2(0, 0, w * k, 8), hc)
	poss_bar.draw_rect(Rect2(w * k, 0, w * (1.0 - k), 8), ac)
	poss_bar.draw_rect(Rect2(0, 0, w, 8), PsKit.INK, false, 2.0)

func _refresh_stats() -> void:
	var a: float = float(_touch["home"])
	var b: float = float(_touch["away"])
	var ph: int = int(round(100.0 * a / maxf(1.0, a + b)))
	stats_l.text = "Possession %d%% - %d%%   Shots %d (%d) - %d (%d)" % [ph, 100 - ph, _shots["home"], _sot["home"], _shots["away"], _sot["away"]]
	poss_bar.queue_redraw()

# ------------------------------------------------------------------ playback

func _process(delta: float) -> void:
	if _ended or _talking:
		return
	if _wait > 0.0:
		_wait -= delta * float(_speed)
		return
	_tick()

## One step of playback: show the next event, or ask the sim for the next minute, or stop for a team talk.
func _tick() -> void:
	if not _queue.is_empty():
		_play(_queue.pop_front())
		return
	if sim.finished:
		_end()
		return
	if PsMatchSim.DECISION_MINUTES.has(sim.minute) and not _asked.has(sim.minute):
		_asked.append(sim.minute)
		_open_talk()
		return
	_queue = sim.step()

func _play(ev: Dictionary) -> void:
	var type: String = str(ev["type"])
	var side: String = str(ev.get("side", ""))
	_score = ev["score"]
	score_l.text = "%d - %d" % [_score[0], _score[1]]
	minute_l.text = "%d'" % int(ev["min"]) if type != "fulltime" else "Full time"
	if type in ["pass", "dribble", "shot", "freekick", "corner", "penalty"] and side != "":
		_touch[side] = int(_touch[side]) + 1
	if type == "shot" or type == "penalty":
		if type == "shot":
			_shots[side] = int(_shots[side]) + 1
			if ev["result"] == "goal" or ev["result"] == "save":
				_sot[side] = int(_sot[side]) + 1
	if type == "sub":
		pitch.set_player_name(side, int(ev["slot"]), PsKit.surname(str(ev["player"])))
	var dur: float = pitch.animate(ev)
	_wait = dur
	_commentary(ev)
	_refresh_stats()

func _t(side: String) -> String:
	return str(_names[side])

func _commentary(ev: Dictionary) -> void:
	var type: String = str(ev["type"])
	var side: String = str(ev.get("side", ""))
	var mine: bool = side == my_side
	var m: int = int(ev["min"])
	var tag: String = ""
	if str(ev.get("tag", "")) != "":
		tag = "[color=#f2c23a]  (%s)[/color]" % ev["tag"]
	var line: String = ""
	var kind: String = "mine" if mine else "theirs"
	match type:
		"shot":
			var who: String = str(ev["player"])
			match str(ev["result"]):
				"goal":
					var how: String = {"header": "heads it in", "free": "curls in the free kick", "long": "strikes from distance", "pen": "converts the penalty"}.get(str(ev["kind"]), "scores")
					var asst: String = ""
					if str(ev.get("a", "")) != "":
						asst = ", set up by %s" % ev["a"]
					line = "[b]%d' GOAL![/b] %s %s for %s%s.%s" % [m, who, how, _t(side), asst, tag]
					app.sfx.play("goal" if mine else "miss")
				"save":
					line = "%d' %s saves from %s.%s" % [m, ev["q"], who, tag]
					kind = ""
					app.sfx.play("save")
				"block":
					line = "%d' %s's effort is blocked.%s" % [m, who, tag]
					kind = ""
				_:
					line = "%d' %s shoots wide." % [m, who]
					kind = ""
		"pass":
			if str(ev["kind"]) == "cross" and bool(ev["ok"]):
				line = "%d' %s whips in a cross for %s." % [m, ev["player"], ev["q"]]
				kind = ""
			elif str(ev["kind"]) in ["prog", "long"] and int(ev["zone"]) == 3 and bool(ev["ok"]) and str(ev.get("tag", "")) != "":
				line = "%d' %s slips %s in behind.%s" % [m, ev["player"], ev["q"], tag]
				kind = "mine" if mine else ""
		"foul":
			line = "%d' %s fouls %s." % [m, ev["player"], ev["q"]]
			kind = ""
			if ev["card"] == "yellow":
				line += " [color=#f2c23a]Yellow card.[/color]"
			elif ev["card"] == "red":
				line += " [color=#ff6a5a][b]RED CARD![/b][/color] %s is sent off." % ev["player"]
				kind = "theirs" if mine else "mine"
		"offside":
			line = "%d' %s is flagged offside." % [m, ev["q"]]
			kind = ""
		"corner":
			line = "%d' Corner to %s, taken by %s." % [m, _t(side), ev["player"]]
			kind = ""
		"freekick":
			line = "%d' Free kick for %s. %s stands over it." % [m, _t(side), ev["player"]]
			kind = ""
		"penalty":
			line = "[b]%d' PENALTY![/b] %s steps up for %s." % [m, ev["player"], _t(side)]
		"clearance":
			if m % 3 == 0:
				line = "%d' %s clears the danger." % [m, ev["player"]]
				kind = ""
		"sub":
			line = "%d' Substitution (%s): %s replaces %s." % [m, _t(side), ev["player"], ev["q"]]
			kind = ""
			app.sfx.play("pick")
		"injury":
			line = "%d' %s is injured and has to go off." % [m, ev["player"]]
			kind = ""
		"mentality":
			line = "%d' %s switch to %s." % [m, _t(side), str(PsMatchSim.MENTALITY_LABEL[ev["mentality"]]).to_lower()]
			kind = ""
		"halftime":
			line = "[b]Half time[/b]  %d - %d" % [_score[0], _score[1]]
			app.sfx.play("whistle")
			kind = ""
		"kickoff":
			line = "Kick off! %s against %s." % [_t("home"), _t("away")]
			kind = ""
		"fulltime":
			line = "[b]Full time[/b]  %d - %d" % [_score[0], _score[1]]
			kind = ""
	if line != "":
		_push(line, kind)

func _push(text: String, kind: String) -> void:
	var color: String = "#fff4e0"
	if kind == "mine":
		color = "#8be08b"
	elif kind == "theirs":
		color = "#ff9a8a"
	_lines.append("[color=%s]%s[/color]" % [color, text])
	while _lines.size() > 5:
		_lines.pop_front()
	feed.text = ""
	feed.append_text("\n".join(_lines))

# ------------------------------------------------------------------ team talk

func _open_talk() -> void:
	_talking = true
	_pending_slot = -1
	speed_btn.disabled = true
	skip_btn.disabled = true
	_build_talk()
	talk.visible = true

func _build_talk() -> void:
	for c in talk.get_children():
		c.queue_free()
	var v: VBoxContainer = PsKit.vbox(6)
	talk.add_child(v)
	var title: String = "Half time team talk" if sim.minute == 45 else "Minute %d: your call" % sim.minute
	v.add_child(PsKit.lbl("%s   %d - %d" % [title, sim.goals[my_side], sim.goals["away" if my_side == "home" else "home"]], 17, PsKit.GOLD))
	v.add_child(PsKit.lbl("Mentality", 14, PsKit.DIM))
	var mrow: HBoxContainer = PsKit.hbox(4)
	v.add_child(mrow)
	var cur: String = str(sim.sides[my_side]["mentality"])
	for m in PsMatchSim.MENTALITIES:
		var b: Button = PsKit.btn(PsMatchSim.MENTALITY_LABEL[m], _set_mentality.bind(m), "gold" if m == cur else "normal", 40)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mrow.add_child(b)
	v.add_child(PsKit.lbl(str(PsMatchSim.MENTALITY_DESC[cur]), 12, PsKit.DIM))
	v.add_child(PsKit.lbl("Substitutions: %d left. Tap a tired player, then who replaces him." % sim.calls_left(my_side), 13, PsKit.DIM))
	var list: VBoxContainer = PsKit.vbox(3)
	v.add_child(PsKit.scroll(list))
	var s: Dictionary = sim.sides[my_side]
	if _pending_slot < 0:
		for slot in sim.tired_slots(my_side).slice(0, 6):
			var p: Dictionary = s["xi"][int(slot)]
			var en: int = sim.energy_of(my_side, int(slot))
			var lb: String = "%d  %s  (%s)   energy %d%%" % [int(slot) + 1, p["name"], p["pos"], en]
			var btn: Button = PsKit.btn(lb, _pick_out.bind(int(slot)), "normal", 36)
			btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
			btn.add_theme_font_size_override("font_size", 14)
			btn.disabled = sim.calls_left(my_side) <= 0
			list.add_child(btn)
	else:
		var out: Dictionary = s["xi"][_pending_slot]
		list.add_child(PsKit.lbl("%s comes off. Who comes on?" % out["name"], 14, PsKit.CREAM))
		var any: bool = false
		for b in s["bench"].size():
			var cand: Dictionary = s["bench"][b]
			if cand["pos"] != out["pos"]:
				continue
			any = true
			var lb2: String = "%s  ATT %d DEF %d TMP %d STA %d" % [cand["name"], int(cand["att"]), int(cand["def"]), int(cand["tmp"]), int(cand["sta"])]
			var bb: Button = PsKit.btn(lb2, _do_sub.bind(b), "primary", 40)
			bb.alignment = HORIZONTAL_ALIGNMENT_LEFT
			bb.add_theme_font_size_override("font_size", 13)
			list.add_child(bb)
		if not any:
			list.add_child(PsKit.lbl("Nobody on the bench plays that position.", 13, PsKit.DIM))
		list.add_child(PsKit.btn("Cancel", _cancel_pick, "ghost", 36))
	v.add_child(PsKit.btn("Play on", _close_talk, "primary", 50))

func _set_mentality(m: String) -> void:
	app.sfx.play("click")
	sim.set_mentality(my_side, m)
	app.st["mentality"] = m
	_build_talk()

func _pick_out(slot: int) -> void:
	app.sfx.play("click")
	_pending_slot = slot
	_build_talk()

func _cancel_pick() -> void:
	_pending_slot = -1
	_build_talk()

func _do_sub(bench_index: int) -> void:
	if sim.substitute(my_side, _pending_slot, bench_index):
		app.sfx.play("pick")
		for ev in sim.events.slice(-1):
			_play(ev)
		_wait = 0.0
	_pending_slot = -1
	_build_talk()

func _close_talk() -> void:
	app.sfx.play("click")
	talk.visible = false
	_talking = false
	_queue.clear()
	speed_btn.disabled = false
	skip_btn.disabled = false
	_wait = 0.2

# ------------------------------------------------------------------ speed, skip, end

func _toggle_speed() -> void:
	app.sfx.play("click")
	_speed = 2 if _speed == 1 else (4 if _speed == 2 else 1)
	speed_btn.text = "Speed x%d" % _speed

func _skip() -> void:
	app.sfx.play("click")
	while not sim.finished:
		sim.step()
	_queue.clear()
	var hg: int = int(sim.goals["home"])
	var ag: int = int(sim.goals["away"])
	score_l.text = "%d - %d" % [hg, ag]
	_score = [hg, ag]
	_lines.clear()
	for sc in sim.scorers:
		var mine: bool = sc["side"] == my_side
		_lines.append("[color=%s]%d' GOAL! %s (%s)[/color]" % ["#8be08b" if mine else "#ff9a8a", int(sc["min"]), sc["name"], _t(sc["side"])])
	while _lines.size() > 6:
		_lines.pop_front()
	feed.text = ""
	feed.append_text("\n".join(_lines))
	for side in ["home", "away"]:
		_shots[side] = int(sim.sides[side]["stats"]["shots"])
		_sot[side] = int(sim.sides[side]["stats"]["on_target"])
		_touch[side] = int(sim.sides[side]["stats"]["touches"])
	_refresh_stats()
	_end()

func _end() -> void:
	_ended = true
	talk.visible = false
	speed_btn.visible = false
	skip_btn.visible = false
	done_btn.visible = true
	app.sfx.play("whistle")
	minute_l.text = "Full time"
	score_l.text = "%d - %d" % [int(sim.goals["home"]), int(sim.goals["away"])]

func _finish() -> void:
	app.sfx.play("click")
	var events: Array = sim.events.duplicate(true)
	var summary: Dictionary = PsClub.finish_matchday(app.st, sim)
	app.save()
	app.go("result", {"summary": summary, "events": events, "my_side": my_side, "names": _names})
