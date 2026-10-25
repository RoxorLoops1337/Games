extends RefCounted

func run(t: PsT) -> void:
	var st: Dictionary = PsClub.new_game(99, "Save FC", 3)
	PsClub.pick_card(st, st["offer"][0])
	var text: String = PsSave.encode(st)
	var r: Dictionary = PsSave.decode(text)
	t.ok(r["ok"], "a fresh save decodes")
	t.eq(r["migrated_from"], PsClub.SCHEMA, "no migration needed for the current version")
	t.eq(JSON.stringify(r["state"]["squad"]), JSON.stringify(st["squad"]), "squad survives the round trip")
	t.eq(typeof(r["state"]["squad"][0]["att"]), TYPE_INT, "numbers come back as integers")
	t.eq(typeof(r["state"]["seed"]), TYPE_INT, "the seed is still an integer")
	# The restored game plays exactly like the original.
	var a: Dictionary = PsClub.team_cfg(st, 0, true)
	var b: Dictionary = PsClub.team_cfg(r["state"], 0, true)
	var opp: Dictionary = PsClub.team_cfg(st, 1)
	var m1: PsMatchSim = PsMatchSim.simulate(5, a, opp)
	var m2: PsMatchSim = PsMatchSim.simulate(5, b, opp)
	t.eq(JSON.stringify(m1.events), JSON.stringify(m2.events), "a restored game replays the same match")

	# Migration from version 0.
	var old: Dictionary = JSON.parse_string(text)
	old["schema_version"] = 0
	old.erase("legends")
	old.erase("legacy")
	old.erase("titles")
	var rm: Dictionary = PsSave.decode(JSON.stringify(old))
	t.ok(rm["ok"], "a version 0 save is migrated")
	t.eq(rm["migrated_from"], 0, "the migration is reported")
	t.eq(rm["state"]["schema_version"], PsClub.SCHEMA, "and lands on the current version")
	t.eq(rm["state"]["legends"], [], "new fields get defaults")

	# Bad saves are refused, never half-loaded.
	t.ok(not PsSave.decode("not json at all")["ok"], "garbage is refused")
	t.ok(not PsSave.decode("[1,2,3]")["ok"], "wrong JSON type is refused")
	var future: Dictionary = JSON.parse_string(text)
	future["schema_version"] = 999
	t.ok(not PsSave.decode(JSON.stringify(future))["ok"], "a save from the future is refused")
	var broken: Dictionary = JSON.parse_string(text)
	broken.erase("squad")
	t.ok(not PsSave.decode(JSON.stringify(broken))["ok"], "a save without a squad is refused")
	var short: Dictionary = JSON.parse_string(text)
	short["season"]["fixtures"] = []
	t.ok(not PsSave.decode(JSON.stringify(short))["ok"], "a save with broken fixtures is refused")
	# Disk round trip and backup.
	PsSave.wipe()
	t.ok(not PsSave.has_save(), "wiped")
	t.ok(PsSave.write(st), "written to disk")
	t.ok(PsSave.has_save(), "present on disk")
	var disk: Dictionary = PsSave.read()
	t.ok(disk["ok"], "read back from disk")
	st["club"]["money"] = 4242
	PsSave.write(st)
	var f: FileAccess = FileAccess.open(PsSave.SAVE_PATH, FileAccess.WRITE)
	f.store_string("{damaged")
	f.close()
	var recovered: Dictionary = PsSave.read()
	t.ok(recovered["ok"], "a damaged save falls back to the backup")
	t.ok(str(recovered["error"]).find("backup") >= 0, "and says so")
	PsSave.wipe()
