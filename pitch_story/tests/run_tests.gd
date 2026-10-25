extends SceneTree
## Headless test runner:  godot --headless --path pitch_story -s tests/run_tests.gd
## Every tests/*.test.gd must `extends RefCounted` and have `func run(t: PsT) -> void`.
## Exit code 0 only when every assertion passed AND at least one suite ran.

func _init() -> void:
	var dir: DirAccess = DirAccess.open("res://tests")
	var files: Array = []
	if dir:
		for f in dir.get_files():
			if f.ends_with(".test.gd"):
				files.append(f)
	files.sort()
	var t: PsT = PsT.new()
	t.tree = self
	for f in files:
		t.current = f
		print("suite %s" % f)
		var script: GDScript = load("res://tests/" + f)
		var suite: Object = script.new()
		await suite.run(t)
	print("%d suites, %d passed, %d failed" % [files.size(), t.passed, t.failed])
	if files.is_empty():
		printerr("NO SUITES FOUND: nothing was tested")
		quit(2)
		return
	quit(1 if t.failed > 0 else 0)
