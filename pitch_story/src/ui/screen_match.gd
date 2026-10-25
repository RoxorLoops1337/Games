class_name PsMatchScreen
extends Control
## Plays one match day. The sim runs a minute at a time and this screen only watches it.
## At minutes 30 and 65 the game pauses for a live call.

const CALL_MINUTES: Array = [30, 65]
const STEP_1X: float = 0.16
const STEP_2X: float = 0.07

var app: PsApp
var args: Dictionary = {}
var sim: PsMatchSim
var fx: Dictionary
var my_side: String = "home"
var pitch: PsPitchView
var score_l: Label
var minute_l: Label
var feed: RichTextLabel
var call_panel: PanelContainer
var speed_btn: Button
var skip_btn: Button
var done_btn: Button
var _lines: Array = []
var _accum: float = 0.0
var _hold: float = 0.0
var _speed: int = 1
var _asked: Array = []
var _waiting_call: bool = false
var _ended: bool = false
var _names: Dictionary = {}

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
	var col: VBoxContainer = PsKit.vbox(6)
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
	var hn: Label = PsKit.lbl(_names["home"], 15, PsKit.CREAM)
	hn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hn.autowrap_mode = TextServer.AUTOWRAP_OFF
	hn.clip_text = true
	teams.add_child(hn)
	var an: Label = PsKit.lbl(_names["away"], 15, PsKit.CREAM, HORIZONTAL_ALIGNMENT_RIGHT)
	an.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	an.autowrap_mode = TextServer.AUTOWRAP_OFF
	an.clip_text = true
	teams.add_child(an)
	score_l = PsKit.lbl("0 - 0", 40, PsKit.GOLD, HORIZONTAL_ALIGNMENT_CENTER)
	bv.add_child(score_l)
	minute_l = PsKit.lbl("Kick off", 14, PsKit.DIM, HORIZONTAL_ALIGNMENT_CENTER)
	bv.add_child(minute_l)

	pitch = PsPitchView.new()
	pitch.custom_minimum_size = Vector2(0, 120)
	pitch.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pitch.clip_contents = true
	var mine: Color = PsKit.club_colors(st)[0]
	var theirs: Color = PsClub.COLORS[(int(st["club"]["color"]) + 2 + int(fx["opp"])) % PsClub.COLORS.size()][0]
	if theirs == mine:
		theirs = Color("e9e9e9")
	pitch.home_color = mine if my_side == "home" else theirs
	pitch.away_color = theirs if my_side == "home" else mine
	col.add_child(pitch)

	feed = RichTextLabel.new()
	feed.bbcode_enabled = true
	feed.fit_content = false
	feed.scroll_active = false
	feed.custom_minimum_size = Vector2(0, 100)
	feed.add_theme_font_size_override("normal_font_size", 14)
	feed.add_theme_font_size_override("bold_font_size", 14)
	col.add_child(feed)

	call_panel = PsKit.panel(PsKit.PANEL_HI, PsKit.GOLD)
	call_panel.visible = false
	col.add_child(call_panel)

	var row: HBoxContainer = PsKit.hbox(6)
	col.add_child(row)
	speed_btn = PsKit.btn("Speed x1", _toggle_speed, "normal", 44)
	speed_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(speed_btn)
	skip_btn = PsKit.btn("Skip to end", _skip, "ghost", 44)
	skip_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(skip_btn)
	done_btn = PsKit.btn("Full time: continue", _finish, "primary", 52)
	done_btn.visible = false
	col.add_child(done_btn)
	_push("Teams are out. The referee checks his watch...", "")
	app.sfx.play("whistle")
	_hold = 1.0

func _process(delta: float) -> void:
	if _ended or _waiting_call:
		return
	if _hold > 0.0:
		_hold -= delta
		return
	_accum += delta
	var step_time: float = STEP_1X if _speed == 1 else STEP_2X
	while _accum >= step_time and not _waiting_call and _hold <= 0.0 and not _ended:
		_accum -= step_time
		_tick()

func _tick() -> void:
	var evs: Array = sim.step()
	minute_l.text = "%d'" % sim.minute
	for ev in evs:
		_show(ev)
	score_l.text = "%d - %d" % [sim.goals["home"], sim.goals["away"]]
	if sim.finished:
		_end()
		return
	if CALL_MINUTES.has(sim.minute) and not _asked.has(sim.minute) and sim.calls_left(my_side) > 0:
		_asked.append(sim.minute)
		_open_call()

func _show(ev: Dictionary) -> void:
	var mine: bool = ev["side"] == my_side
	pitch.show_event(ev)
	var tag: String = str(ev.get("tag", ""))
	var tag_txt: String = ""
	if tag != "":
		tag_txt = "[color=#f2c23a]  (%s)[/color]" % tag
	match str(ev["type"]):
		"goal":
			_push("[b]%d' GOAL![/b] %s scores for %s.%s" % [ev["min"], ev["player"], _names[ev["side"]], tag_txt], "mine" if mine else "theirs")
			app.sfx.play("goal" if mine else "miss")
			_hold = 1.3
		"save":
			_push("%d' %s saves from %s.%s" % [ev["min"], ev["gk"], ev["player"], tag_txt], "")
			app.sfx.play("save")
		"block":
			_push("%d' %s's shot is blocked.%s" % [ev["min"], ev["player"], tag_txt], "")
		"miss":
			_push("%d' %s fires wide." % [ev["min"], ev["player"]], "")
		"halftime":
			_push("[b]Half time[/b]  %d - %d" % [sim.goals["home"], sim.goals["away"]], "")
			app.sfx.play("whistle")
			_hold = 0.8
		"call":
			var who: String = "You" if ev["side"] == my_side else "They"
			_push("%d' %s: %s" % [ev["min"], who, PsMatchSim.CALL_LABEL[ev["call"]]], "")
		"fulltime":
			_push("[b]Full time[/b]  %d - %d" % [sim.goals["home"], sim.goals["away"]], "")

func _push(text: String, kind: String) -> void:
	var color: String = "#fff4e0"
	if kind == "mine":
		color = "#8be08b"
	elif kind == "theirs":
		color = "#ff9a8a"
	_lines.append("[color=%s]%s[/color]" % [color, text])
	while _lines.size() > 6:
		_lines.pop_front()
	feed.text = ""
	feed.append_text("\n".join(_lines))

func _open_call() -> void:
	_waiting_call = true
	for c in call_panel.get_children():
		c.queue_free()
	var v: VBoxContainer = PsKit.vbox(4)
	call_panel.add_child(v)
	v.add_child(PsKit.lbl("Live call, minute %d  (%d-%d). Make a change?" % [sim.minute, sim.goals[my_side], sim.goals["away" if my_side == "home" else "home"]], 15, PsKit.GOLD))
	var row: HBoxContainer = PsKit.hbox(4)
	v.add_child(row)
	for id in ["push", "bus", "legs"]:
		var b: Button = PsKit.btn(PsMatchSim.CALL_LABEL[id], _call.bind(id), "normal", 44)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 14)
		b.tooltip_text = PsMatchSim.CALL_DESC[id]
		row.add_child(b)
	v.add_child(PsKit.lbl("Push: attack +6, defence -5.  Bus: defence +7, attack -5.  Legs: fresher in the last 30.", 12, PsKit.DIM))
	v.add_child(PsKit.btn("Hold shape (no change)", _call.bind(""), "ghost", 38))
	call_panel.visible = true
	speed_btn.disabled = true
	skip_btn.disabled = true

func _call(id: String) -> void:
	if id != "":
		sim.apply_call(my_side, id)
		app.sfx.play("pick")
		for ev in sim.events.slice(-1):
			_show(ev)
	else:
		app.sfx.play("click")
	call_panel.visible = false
	_waiting_call = false
	speed_btn.disabled = false
	skip_btn.disabled = false

func _toggle_speed() -> void:
	app.sfx.play("click")
	_speed = 2 if _speed == 1 else 1
	speed_btn.text = "Speed x%d" % _speed

func _skip() -> void:
	app.sfx.play("click")
	while not sim.finished:
		for ev in sim.step():
			if ev["type"] == "goal":
				_lines.append("[color=%s]%d' GOAL! %s (%s)[/color]" % ["#8be08b" if ev["side"] == my_side else "#ff9a8a", ev["min"], ev["player"], _names[ev["side"]]])
	while _lines.size() > 6:
		_lines.pop_front()
	feed.text = ""
	feed.append_text("\n".join(_lines))
	score_l.text = "%d - %d" % [sim.goals["home"], sim.goals["away"]]
	minute_l.text = "90'"
	_end()

func _end() -> void:
	_ended = true
	call_panel.visible = false
	speed_btn.visible = false
	skip_btn.visible = false
	done_btn.visible = true
	app.sfx.play("whistle")
	minute_l.text = "Full time"
	_push("[b]Full time[/b]  %d - %d" % [sim.goals["home"], sim.goals["away"]], "")

func _finish() -> void:
	app.sfx.play("click")
	var events: Array = sim.events.duplicate(true)
	var summary: Dictionary = PsClub.finish_matchday(app.st, sim)
	app.save()
	app.go("result", {"summary": summary, "events": events, "my_side": my_side})
