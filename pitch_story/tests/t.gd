class_name PsT
extends RefCounted
## Tiny assertion helper for the headless runner.

var passed: int = 0
var failed: int = 0
var current: String = ""
var tree: SceneTree

func ok(cond: bool, msg: String) -> void:
	if cond:
		passed += 1
	else:
		failed += 1
		printerr("  FAIL [%s] %s" % [current, msg])

func eq(a: Variant, b: Variant, msg: String) -> void:
	ok(a == b, "%s (got %s, expected %s)" % [msg, str(a), str(b)])
