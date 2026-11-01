# Current Best Practices (post-4.3, as stated by fetched pages)

Last verified: 2026-10-25

Only practices that a fetched page states. Each section lists its source. Anything the pages do not state is marked NOT SOURCEABLE.
Docs source base: `godot-docs` git branch `4.7` (rendered at https://docs.godotengine.org/en/4.7/).

## GDScript

Source: `tutorials/scripting/gdscript/gdscript_basics.rst` (https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_basics.html)

| Practice | Since | Detail from the page |
|---|---|---|
| Typed dictionaries `Dictionary[K, V]` | 4.4 | Both key and value type must be given (use `Variant` for untyped side). Writes are type-checked; analyzer understands them; methods that return values still return `Variant`. Nested typed collections such as `Dictionary[String, Dictionary[String, int]]` are NOT supported. `Dictionary` == `Dictionary[Variant, Variant]`. |
| Variadic functions via rest parameter `...args` | 4.5 | At most one, must be last, no default. Static and lambda functions can be variadic. `Array[int]` is not allowed as the rest-parameter type (use `...values: Array`). No spread syntax: use `callv()` to forward args. |
| `@abstract` classes and methods | 4.5 | Abstract classes cannot be instantiated or attached to a node (engine errors "Script ... should not be abstract"). A class with any abstract method must itself be `@abstract`. For optional overrides use a normal method with a default body. |
| Override of a typed method inherits the return type; add `return null` where needed | 4.7 | Source: upgrading_to_godot_4.7.rst (https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.7.rst) |
| Static variables and `@static_unload` | page (no version stated) | `static var` belongs to the class; a script with static variables is not unloaded even with no instances left. Clean data up manually, or use `@static_unload` if the static data is not important and can be reset. |
| Typed `for` loop variable | 4.2 (page: "Since Godot 4.2") | `static_typing.rst` line: "Since Godot 4.2, you can also specify a type for the loop variable in a `for` loop." |

Source for the 4.7 GDScript tooling bullets (changelog, 4.7 section): https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md
- "Add `CONFUSABLE_TEMPORARY_MODIFICATION` warning", "Deprecate `type_exists()` global function", "Call static methods in native base class", "Inherit parent method return types for untyped overrides", "LSP: Fix type bind, mark as experimental, deprecate direct LSP access". These are changelog bullets only; semantics beyond the bullet text are NOT SOURCEABLE.

## Saving and loading

Source: upgrading_to_godot_4.4 / 4.5 / 4.6 rst (URLs in `breaking-changes.md`)

| Practice | Why (as stated) |
|---|---|
| Check the `bool` result of `FileAccess.store_*` calls | They return `bool` since 4.4 (previously `void`). |
| Don't pass `skip_cr` to `FileAccess.get_as_text()` | Parameter removed in 4.6. |
| Use `@export_file_path` when you need a literal `res://` string; `@export_file` can store `uid://` | 4.4 behaviour; `@export_file_path` added 4.5. |
| For deep copies of save-state Resources that reference external resources, call `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` | `duplicate(true)` stopped copying external resources in 4.5. |
| Prefer `JSON.from_native()` / `JSON.to_native()` over `inst_to_dict()` / `dict_to_inst()` | The latter are marked deprecated in the 4.7.1 class XML ("Consider using ..."). |
| For binary blobs use `var_to_bytes()` / `FileAccess.store_var()` + `PackedByteArray.compress()` or `FileAccess.open_compressed()` rather than `PackedDataContainer` | Class marked deprecated in the 4.7.1 class XML with exactly that advice. |

Source: `tutorials/io/saving_games.rst` (https://docs.godotengine.org/en/4.7/tutorials/io/saving_games.html), no version-specific change stated:
- Mark persistent nodes with a group (page uses "Persist"), give each a save function returning a Dictionary, serialize with `JSON.stringify()`, write via `FileAccess.open("user://savegame.save", FileAccess.WRITE)`, read back with `JSON.new().parse()` and check the parse error.
- `Vector2` is not supported by JSON (page stores `pos_x`, `pos_y` separately).
- User configuration (settings) can use `ConfigFile`.
- NOT SOURCEABLE — save versioning/migration and atomic-write guidance, not stated at the saving_games page. Web `user://` persistence is sourced in `modules/web-export.md`.

## Headless / CI

Source: `tutorials/editor/command_line_tutorial.rst` (https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html)

- `--headless` = `--display-driver headless --audio-driver Dummy`; "Useful for servers and with `--script`."
- For CLI export (`godot --headless --path <proj> --export-release <preset> <out>`): `--headless` is **required** on platforms without GPU access such as CI; `godot` must be an editor binary (not an export template) and export templates must be installed.
- 4.7.1 changelog: "Fix incorrect per-instance shader parameters when exporting in headless mode" (https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md).
- NOT SOURCEABLE — gdUnit4 usage, version compatibility with 4.7.1, and its CLI flags: not stated at any Godot page fetched.

## Rendering (Compatibility renderer, 2D)

Source: https://docs.godotengine.org/en/4.7/tutorials/rendering/jitter_stutter.html (`tutorials/rendering/jitter_stutter.rst`)

- Since 4.4 Forward+/Mobile use an ubershader approach to avoid shader-compilation stutter; the **Compatibility renderer cannot** (OpenGL limitation). Page advice for Compatibility: show every mesh/visual effect once in front of the camera for one frame during level load so shaders compile then.
- 4.7: `CanvasItem` line drawing no longer has an antialiasing feather (thinner lines than 4.6).
- Web only supports Compatibility (WebGL 2.0): see `modules/web-export.md`.

## Physics interpolation

Source: `tutorials/physics/interpolation/physics_interpolation_introduction.rst` (https://docs.godotengine.org/en/4.7/tutorials/physics/interpolation/physics_interpolation_introduction.html)

- Page explains physics ticks (default 60/s, `physics/common/physics_ticks_per_second`) vs rendered frames and the stair-stepping jitter when they differ.
- NOT SOURCEABLE — which version added 2D physics interpolation and exactly how to enable it for 2D nodes, not stated in the intro page lines read. (The 4.5 guide only notes `RenderingServer.instance_set_interpolated` / `instance_reset_physics_interpolation` were removed.)

## Input

- 4.5: "the engine relies on SDL 3" for controller support (`tutorials/inputs/controllers_gamepads_joysticks.rst`, https://docs.godotengine.org/en/4.7/tutorials/inputs/controllers_gamepads_joysticks.html).
- 4.7: use event type or `InputEvent.DEVICE_ID_MOUSE` / `DEVICE_ID_KEYBOARD`, not `device == 0` (upgrade guide 4.7).
- NOT SOURCEABLE — touch-input best practices (`emulate_mouse_from_touch`, `InputEventScreenTouch` handling) changes since 4.3, not stated at the upgrade guides.

## UI

See `modules/ui.md`.
