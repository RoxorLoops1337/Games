# Module: GDScript (4.4 - 4.7)

Last verified: 2026-10-25

Sources: `gdscript_basics.rst` on godot-docs branch `4.7` (https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_basics.html); upgrade guide 4.6->4.7 (https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.7.rst); class XML at tag 4.7.1-stable; changelog https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md.

## New language features

```gdscript
# 4.4+: typed dictionaries (both key and value type required; Variant = untyped side)
var prices: Dictionary[String, int] = {}
var anything: Dictionary[String, Variant] = {}
# NOT supported: Dictionary[String, Dictionary[String, int]]

# 4.5+: variadic functions (rest parameter must be last, has no default, and cannot be typed `Array[int]`)
func log_all(prefix: String, ...values: Array) -> void:
    prints(prefix, values)
# no spread syntax: use callv(array)

# 4.5+: abstract classes/methods
@abstract class Building:
    @abstract func produce()
```

(Snippets are adapted from the examples in the cited page; behaviours in the comments are the page's statements.)

## Behaviour changes that bite

| Change | Version | Fix |
|---|---|---|
| Override of a method with typed return inherits that return type, so a missing `return` is an error | 4.7 | add `return null` at the end |
| Setting one element of a packed array no longer invokes the property setter for the whole array | 4.7 | if the setter had side effects (signals, redraw), call them explicitly (the fix advice is an inference; the guide only states the behaviour) |
| `Object.is_class()` takes `StringName` | 4.7 | GDScript-compatible |
| `Node.set_name()` takes `StringName` | 4.5 | GDScript-compatible |
| `Node.get_rpc_config()` renamed `get_node_rpc_config()` | 4.5 | rename |
| `AnimationPlayer.current_animation` etc. are `StringName` | 4.6 | compare with `&"name"` or convert; guide flags GDScript-compatible |
| `FileAccess.store_*` return `bool` | 4.4 | handle result |
| `FileAccess.get_as_text()` has no `skip_cr` | 4.6 | drop argument |

## Deprecated globals

`type_exists` -> `ClassDB.class_exists`; `convert` -> `type_convert`; `Color8` -> `Color.from_rgba8`; `inst_to_dict`/`dict_to_inst` -> `JSON.from_native`/`JSON.to_native` (see `deprecated-apis.md`).

## 4.7 GDScript changelog bullets (text only)

"Add `CONFUSABLE_TEMPORARY_MODIFICATION` warning"; "Call static methods in native base class"; "Fix type deduction for functions without `return` statements"; "Fix return type checking for inferred function type"; "Fix use of `class_name` in built-in scripts"; "Improve evaluation of constant expressions with arrays/dictionaries"; "Preserve compatibility for untyped return of `_get_property_list()`"; "Fix interrupted coroutines not clearing"; "LSP: ... deprecate direct LSP access".
NOT SOURCEABLE — exact semantics/examples of each bullet above, not stated at the changelog.
NOT SOURCEABLE — GDScript changes for 4.4 and 4.5 beyond typed dictionaries, variadics and `@abstract` (e.g. a changelog of the 4.4/4.5 GDScript section was not read), not stated at the pages fetched.
