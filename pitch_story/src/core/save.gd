class_name PsSave
extends RefCounted
## Versioned save. The file holds the whole state plus `schema_version`.
## To change the state shape: bump PsClub.SCHEMA, add MIGRATIONS[n] (n -> n+1) and a test.
## Never rename SAVE_PATH or the web storage key once the game is live.

const SAVE_PATH: String = "user://pitchstory_save.json"
const BACKUP_PATH: String = "user://pitchstory_save.bak.json"

## MIGRATIONS[n] upgrades a version-n state to version n+1, in place.
static func migrations() -> Dictionary:
	return {
		# 0 -> 1: pre-release saves had no legends list or legacy card.
		0: func(st: Dictionary) -> void:
			if not st.has("legends"):
				st["legends"] = []
			if not st.has("legacy"):
				st["legacy"] = ""
			if not st.has("titles"):
				st["titles"] = 0
			if not st.has("seasons_done"):
				st["seasons_done"] = 0
			if not st.has("offer_n"):
				st["offer_n"] = 0
			st["schema_version"] = 1,
		# 1 -> 2: formations and mentality (the match engine now plays 4-4-2, 4-3-3, 3-5-2 and 5-3-2).
		1: func(st: Dictionary) -> void:
			if not st.has("formation"):
				st["formation"] = "4-4-2"
			if not st.has("mentality"):
				st["mentality"] = "balanced"
			if st.has("season") and st["season"].has("teams"):
				var i: int = 0
				for t in st["season"]["teams"]:
					if not t.has("formation"):
						t["formation"] = "4-4-2"
					i += 1
			st["schema_version"] = 2,
	}

## JSON turns every number into a float: put the integers back.
static func normalize(v: Variant) -> Variant:
	match typeof(v):
		TYPE_FLOAT:
			var f: float = v
			if f == floorf(f) and absf(f) < 9.0e15:
				return int(f)
			return v
		TYPE_ARRAY:
			var a: Array = []
			for x in v:
				a.append(normalize(x))
			return a
		TYPE_DICTIONARY:
			var d: Dictionary = {}
			for k in v:
				d[k] = normalize(v[k])
			return d
	return v

static func encode(st: Dictionary) -> String:
	return JSON.stringify(st)

## Returns {"ok": bool, "state": Dictionary, "error": String, "migrated_from": int}.
static func decode(text: String) -> Dictionary:
	var json: JSON = JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return {"ok": false, "state": {}, "error": "Save is not valid JSON.", "migrated_from": -1}
	var st: Dictionary = normalize(json.data)
	var ver: int = int(st.get("schema_version", 0))
	if ver > PsClub.SCHEMA:
		return {"ok": false, "state": {}, "error": "Save is from a newer version of the game.", "migrated_from": ver}
	var from_ver: int = ver
	var mig: Dictionary = migrations()
	while ver < PsClub.SCHEMA:
		if not mig.has(ver):
			return {"ok": false, "state": {}, "error": "No migration from version %d." % ver, "migrated_from": from_ver}
		mig[ver].call(st)
		ver = int(st.get("schema_version", ver + 1))
	var problem: String = validate(st)
	if problem != "":
		return {"ok": false, "state": {}, "error": problem, "migrated_from": from_ver}
	return {"ok": true, "state": st, "error": "", "migrated_from": from_ver}

## A save that parses but cannot be played must be refused, not loaded half-broken.
static func validate(st: Dictionary) -> String:
	for key in ["club", "facilities", "squad", "lineup", "cards", "season", "seed", "next_pid"]:
		if not st.has(key):
			return "Save is missing '%s'." % key
	if typeof(st["squad"]) != TYPE_ARRAY or st["squad"].size() < 11:
		return "Save has no playable squad."
	var s: Dictionary = st["season"]
	for key in ["no", "day", "teams", "fixtures", "table", "results"]:
		if not s.has(key):
			return "Save season is missing '%s'." % key
	if s["teams"].size() != PsClub.TEAMS or s["table"].size() != PsClub.TEAMS:
		return "Save league is the wrong size."
	if s["fixtures"].size() != PsClub.MATCHDAYS:
		return "Save fixtures are the wrong size."
	return ""

static func write(st: Dictionary) -> bool:
	# Keep the previous save as a backup before overwriting it.
	if FileAccess.file_exists(SAVE_PATH):
		var old: String = FileAccess.get_file_as_string(SAVE_PATH)
		var bk: FileAccess = FileAccess.open(BACKUP_PATH, FileAccess.WRITE)
		if bk:
			bk.store_string(old)
			bk.close()
	var f: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		return false
	var ok: bool = f.store_string(encode(st))
	f.close()
	return ok

static func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

static func read() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return {"ok": false, "state": {}, "error": "No save yet.", "migrated_from": -1}
	var r: Dictionary = decode(FileAccess.get_file_as_string(SAVE_PATH))
	if not r["ok"] and FileAccess.file_exists(BACKUP_PATH):
		var b: Dictionary = decode(FileAccess.get_file_as_string(BACKUP_PATH))
		if b["ok"]:
			b["error"] = "Main save was damaged, loaded the backup."
			return b
	return r

static func wipe() -> void:
	for path in [SAVE_PATH, BACKUP_PATH]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
