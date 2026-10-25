class_name PsSfx
extends Node
## Sound effects synthesised at startup. No audio files. The rng here is local and
## cosmetic: it never touches the simulation.

const RATE: int = 22050
var muted: bool = false
var _streams: Dictionary = {}
var _players: Array = []
var _next: int = 0

func _ready() -> void:
	for i in 4:
		var p: AudioStreamPlayer = AudioStreamPlayer.new()
		p.volume_db = -6.0
		add_child(p)
		_players.append(p)
	_streams["click"] = _tone([[880.0, 0.04]], 0.5)
	_streams["pick"] = _tone([[523.0, 0.07], [659.0, 0.07], [784.0, 0.12]], 0.5)
	_streams["coin"] = _tone([[988.0, 0.06], [1319.0, 0.16]], 0.45)
	_streams["whistle"] = _whistle()
	_streams["goal"] = _roar(1.3)
	_streams["miss"] = _tone([[300.0, 0.08], [240.0, 0.12]], 0.4)
	_streams["save"] = _tone([[440.0, 0.05], [380.0, 0.08]], 0.4)
	_streams["win"] = _tone([[523.0, 0.12], [659.0, 0.12], [784.0, 0.12], [1047.0, 0.3]], 0.5)
	_streams["lose"] = _tone([[392.0, 0.16], [330.0, 0.16], [262.0, 0.3]], 0.45)

func play(name: String) -> void:
	if muted or not _streams.has(name) or _players.is_empty():
		return
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = _streams[name]
	p.play()

func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		var v: int = clampi(int(samples[i] * 32767.0), -32768, 32767)
		bytes[i * 2] = v & 0xFF
		bytes[i * 2 + 1] = (v >> 8) & 0xFF
	var w: AudioStreamWAV = AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w

## Square-ish blips: notes is [[hz, seconds], ...].
func _tone(notes: Array, vol: float) -> AudioStreamWAV:
	var out: PackedFloat32Array = PackedFloat32Array()
	for n in notes:
		var count: int = int(float(n[1]) * RATE)
		for i in count:
			var ph: float = fmod(float(i) * float(n[0]) / RATE, 1.0)
			var env: float = 1.0 - float(i) / float(count)
			out.append((1.0 if ph < 0.5 else -1.0) * vol * 0.5 * env)
	return _wav(out)

func _whistle() -> AudioStreamWAV:
	var out: PackedFloat32Array = PackedFloat32Array()
	var count: int = int(0.6 * RATE)
	for i in count:
		var tt: float = float(i) / RATE
		var f: float = 2600.0 + 120.0 * sin(tt * 40.0)
		var env: float = minf(1.0, tt * 30.0) * (1.0 - tt / 0.6)
		out.append(sin(tt * f * TAU) * 0.35 * env)
	return _wav(out)

func _roar(seconds: float) -> AudioStreamWAV:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = 7
	var out: PackedFloat32Array = PackedFloat32Array()
	var count: int = int(seconds * RATE)
	var lp: float = 0.0
	for i in count:
		var tt: float = float(i) / float(count)
		var env: float = minf(1.0, tt * 8.0) * (1.0 - tt) * (0.7 + 0.3 * sin(tt * 40.0))
		lp += (rng.randf_range(-1.0, 1.0) - lp) * 0.22
		out.append(lp * 0.9 * env)
	return _wav(out)
