# Breaking Changes 4.3 -> 4.7.1

Last verified: 2026-10-25

Scope: what can break a GDScript 2D UI/management game (saving/loading, Control/Theme, web export, Compatibility renderer, input/touch, headless tooling). 3D, XR, Android-native, C# and editor-plugin-only entries are omitted unless noted; full lists are in the upgrade guides.

Column "GD" = the guide's own "GDScript Compatible" flag. "OK" = guide marks it GDScript-compatible (code keeps working), "BREAKS" = guide marks it as breaking for GDScript.

Source of every section (fetched as raw text from the godot-docs repo; rendered pages are the same content):
- 4.3->4.4: https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.4.rst (rendered: https://docs.godotengine.org/en/4.7/tutorials/migrating/upgrading_to_godot_4.4.html)
- 4.4->4.5: .../upgrading_to_godot_4.5.rst
- 4.5->4.6: .../upgrading_to_godot_4.6.rst
- 4.6->4.7: .../upgrading_to_godot_4.7.rst
- Patch notes: https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md

The guides' own opening line for each step: "For most games and apps made with 4.x it should be relatively safe to migrate to 4.y."

## Highest-priority checklist for this project

| # | Change | Version | Action |
|---|---|---|---|
| 1 | `@export_file` stores `uid://` paths when set from the Inspector | 4.4 | Use `@export_file_path` (added 4.5) if you need raw `res://` strings |
| 2 | `Resource.duplicate(true)` no longer duplicates external resources | 4.5 | Use `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` for the old behaviour |
| 3 | `FileAccess.get_as_text()` loses `skip_cr` | 4.6 | Remove the argument |
| 4 | Mouse/keyboard `InputEvent.device` is no longer `0` | 4.7 | Compare to `InputEvent.DEVICE_ID_MOUSE` / `DEVICE_ID_KEYBOARD` or check event type |
| 5 | Override of a typed-return method inherits the return type | 4.7 | Add `return null` (or a real return) at the end of the override |
| 6 | `RichTextLabel.add_image/update_image` parameter changes | 4.5 and 4.7 | See table below |
| 7 | `CanvasItem` line drawing no longer has the antialiasing feather | 4.7 | Lines look thinner; raise width if you relied on it |
| 8 | `.tscn` format changes (`load_steps` dropped, unique node IDs added) | 4.6 | Expect large VCS diffs on first re-save |
| 9 | New projects default to stretch `canvas_items` + `expand` | 4.7 | Guide says "newly created projects" only (inference: existing projects keep their saved settings; the guide does not say this explicitly) |

## 4.3 -> 4.4

Source: upgrading_to_godot_4.4.rst (URL above)

### Core / saving / loading

| Change | GD |
|---|---|
| `FileAccess.store_8/16/32/64/buffer/csv_line/double/float/half/line/pascal_string/real/string/var` return type `void` -> `bool` | OK |
| `FileAccess.open_encrypted` new optional `iv` parameter | OK |
| `OS.execute_with_pipe` new optional `blocking` parameter | OK |
| `OS.read_string_from_stdin` new `buffer_size` parameter (4.3 default was `1024`) | BREAKS |
| `RegEx.compile` / `create_from_string` new optional `show_error` | OK |
| `Semaphore.post` new optional `count`; `TranslationServer.standardize_locale` new optional `add_defaults` | OK |
| `@export_file` now returns `uid://` references when assigned from the Inspector (arrays can mix `uid://` and `res://`). In 4.4 the only way to keep `res://` is editing `.tscn`/`.tres` by hand; `@export_file_path` arrives in 4.5 | listed as breaking change in a warning box |
| `Curve` resource now enforces its value range: change `min_value`/`max_value` if points lie outside `[0, 1]` | behaviour |

### GUI nodes

| Change | GD |
|---|---|
| `RichTextLabel.push_meta` new optional `tooltip`; `set_table_column_expand` new optional `shrink` | OK |
| `GraphEdit.connect_node` new optional `keep_alive` | OK |
| `GraphEdit.frame_rect_changed` signal `new_rect` type `Vector2` -> `Rect2` | BREAKS |

### Rendering / particles (2D relevant)

| Change | GD |
|---|---|
| `CPUParticles2D.restart` / `GPUParticles2D.restart` new optional `keep_seed` | OK |
| `RenderingDevice.draw_list_begin` removes many parameters (only matters if you use RenderingDevice directly) | BREAKS |
| `Shader.get/set_default_texture_parameter` use `Texture` instead of `Texture2D` | OK |

### Other (low relevance here)

- `NavigationServer2D.query_path` new optional `callback` (OK).
- Editor plugin API: `EditorSceneFormatImporter._get_import_flags` removed; `EditorTranslationParserPlugin._parse_file` signature changed (both BREAKS, plugin authors only).
- Android sensor events no longer enabled by default; enable in Project Settings > Input Devices > Sensors.
- CSG now uses Manifold; non-manifold meshes unsupported (3D only).

## 4.4 -> 4.5

Source: upgrading_to_godot_4.5.rst (URL above)

### Core

| Change | GD |
|---|---|
| `Node.get_rpc_config` renamed `get_node_rpc_config` | BREAKS |
| `Node.set_name` parameter `name` type `String` -> `StringName` | OK |
| `JSONRPC.set_scope` replaced by `set_method` | BREAKS |
| `Resource.duplicate(true)` (deep) now only duplicates resources internal to the resource file it is called on (4.4 duplicated external ones too). Use `Resource.duplicate_deep(DEEP_DUPLICATE_ALL)` to keep the old behaviour | behaviour |
| `ProjectSettings.add_property_info()` now warns on missing/invalid dictionary keys, notably a `usage` key (never used). Use `set_as_basic()`, `set_restart_if_changed()`, `set_as_internal()` | behaviour |

### Rendering / text / GUI

| Change | GD |
|---|---|
| `RenderingServer.instance_reset_physics_interpolation` and `instance_set_interpolated` removed | BREAKS |
| `CanvasItem.draw_string/draw_char/draw_multiline_string` (+ `_outline`), `Font.draw_*`, `TextLine/TextParagraph.draw*` new optional `oversampling` | OK (only the `TextServerExtension._font_draw_glyph*`/`_shaped_text_draw*` virtuals BREAK) |
| `RichTextLabel.add_image` / `update_image`: `size_in_percent` replaced by `width_in_percent` + `height_in_percent`. GDScript calls keep working but old `size_in_percent` value now feeds `width_in_percent` and `height_in_percent` defaults to `false`; set `height_in_percent` explicitly to restore | OK with behaviour change |
| `RichTextLabel.add_image` new `alt_text`, `push_table` new `name`, `push_underline`/`push_strikethrough` new optional `color`, `TreeItem.add_button` new `alt_text` | OK |
| `DisplayServer.file_dialog_show` / `file_dialog_with_options_show` new optional `parent_window_id` | OK |

### Behaviour

| Change |
|---|
| `TileMapLayer.get_coords_for_body_rid()` returns different values because TileMapLayer physics chunking is on by default; set `physics_quadrant_size` to `1` to get exact 4.4 behaviour |
| Navigation: regions in a map update asynchronously by default (`navigation/world/region_use_async_iterations` toggles it); navmesh merge order changed (`navigation/2d_or_3d/merge_rasterizer_cell_scale`) |
| Jolt (3D only): `Area3D` now always reports static-body overlaps; setting `physics/jolt_physics_3d/simulation/areas_detect_static_bodies` removed |
| C#: Android export needs .NET 9 (irrelevant to GDScript) |

## 4.5 -> 4.6

Source: upgrading_to_godot_4.6.rst (URL above)

### Core / saving / loading

| Change | GD |
|---|---|
| `FileAccess.get_as_text()` removes `skip_cr` parameter | OK per guide flag, but passing the argument will no longer match the signature: remove it |
| `FileAccess.create_temp` `mode_flags` type `int` -> `FileAccess.ModeFlags` | OK |
| `Performance.add_custom_monitor` new optional `type` | OK |
| `.tscn` format: `load_steps` no longer written; unique node IDs now saved. Guide says changes are backwards- and forwards-compatible (4.5 <-> 4.6 scenes load both ways) but re-saving a 4.5 scene in 4.6 yields big diffs. Use Project > Tools > Upgrade Project Files... once, then commit | behaviour |

### Animation

`AnimationPlayer.assigned_animation`, `autoplay`, `current_animation` type `String` -> `StringName`; `get_queue()` returns `StringName[]` (was `PackedStringArray`); signal `current_animation_changed(name)` is `StringName`. Guide flags all as GDScript OK.

### GUI nodes

| Change | GD |
|---|---|
| `Control.grab_focus` new optional `hide_focus`; `Control.has_focus` new optional `ignore_hidden_focus`; `LineEdit.edit` new optional `hide_focus` | OK |
| `SplitContainer.clamp_split_offset` new optional `priority_index` | OK |
| `FileDialog.add_filter` new optional `mime_type` | OK |
| `EditorFileDialog` members moved to base `FileDialog` (editor plugins) | OK |

### Rendering / defaults

| Change | Detail |
|---|---|
| Glow default blend mode now Screen (was Soft Light); several glow defaults changed (`glow_intensity` 0.8 -> 0.3, levels 2-5 changed) | `Environment` property defaults; guide says retune glow after upgrading |
| `PopupMenu.submenu_popup_delay` default 0.3 -> 0.2 | GUI default |
| `ResourceImporterCSVTranslation.compress` default `true` -> `1` | import default |
| New projects: default Windows driver D3D12, default 3D physics Jolt | **newly created projects only**; irrelevant to 2D |
| `AStar2D.get_point_path`, `AStar3D.get_point_path`, `AStarGrid2D.get_id_path`, `AStarGrid2D.get_point_path` now return an empty path when `from_id` is a disabled/solid point | behaviour (affects pathfinding on grids) |
| Android export template source layout moved to `android/build/src/main/java/...` | behaviour (Android only) |

## 4.6 -> 4.7

Source: upgrading_to_godot_4.7.rst (URL above)

### API changes

| Change | GD |
|---|---|
| `Object.is_class` parameter `class` `String` -> `StringName` | OK |
| `OptimizedTranslation.generate` return `void` -> `bool` | OK |
| `ZIPPacker.start_file` new optional `permissions`, `modified_time` | OK |
| `Control.accessibility_live` type `DisplayServer.AccessibilityLiveMode` -> `AccessibilityServer.AccessibilityLiveMode` | OK |
| `RichTextLabel.ImageUpdateMask.UPDATE_WIDTH_IN_PERCENT` renamed `UPDATE_WIDTH_UNIT` | BREAKS |
| `RichTextLabel.add_image`/`update_image`: `width`/`height` `int` -> `float`; `width_in_percent`/`height_in_percent` (bool) renamed `width_unit`/`height_unit` of type `RichTextLabel.ImageUnit` | OK (positional calls keep working; named-argument or keyword use of the old names is NOT covered by the guide: NOT SOURCEABLE — whether GDScript named args exist for these) |
| `TreeItem.select` new optional `set_as_cursor`; `Font.find_variation` new optional `palette_index`, `custom_colors` | OK |
| `Image.save_exr`, `save_exr_to_buffer` new optional `color_image`, `max_linear_value` | OK |
| `ImageTexture.get_format` / `PortableCompressedTexture2D.get_format` moved to base `Texture2D` | OK |
| `RenderingServer.particles_request_process_time` param `time` renamed `process_time`, new optional `process_time_residual`; `CPUParticles2D/GPUParticles2D.request_particles_process` new optional `process_time_residual` | OK |
| `RenderingServer.viewport_set_size` new optional `view_count` | OK |
| `PhysicsServer2D.body_set_shape_as_one_way_collision` new optional `direction`; `PhysicsServer2DExtension._body_set_shape_as_one_way_collision` new `direction` param | `PhysicsServer2D` OK, Extension virtual BREAKS |
| `Animation.length` type metadata `float` -> `double`; `AnimationNodeBlendSpace1D/2D.add_blend_point` new optional `name` | OK |
| `AudioEffectSpectrumAnalyzer.tap_back_pos` removed | BREAKS |
| XR / editor plugin signature changes (`OpenXRExtensionWrapper._on_register_metadata`, `EditorVCSInterface._commit`, `EditorSceneFormatImporter.IMPORT_*` constants moved into `ImportFlags`) | mostly plugin/XR only |

### Behaviour changes

| Change | Detail |
|---|---|
| GDScript: setting an element of a packed array no longer calls the setter of the whole packed-array property | `GH-113228` |
| GDScript: methods overriding a method that has a typed return now inherit that return type, so an explicit `return` is required in the override; add `return null` at the end to fix the error | `GH-115763` |
| Input: mouse and keyboard device IDs changed from `0` to `InputEvent.DEVICE_ID_MOUSE` / `InputEvent.DEVICE_ID_KEYBOARD` (some joypads use `0`); check event type or compare `InputEvent.device` to the constants | |
| Rendering: `CanvasItem` no longer adds the antialiasing feather when drawing lines (lines looked thicker than intended); projects relying on it need a thicker line width | `GH-105122` |
| Rendering: `LinearToSRGB` visual shader no longer clamps to `[0, 1]` on Mobile / Forward+ | not Compatibility |
| Audio/physics: `AudioStreamPlayer.area_mask` default `1` -> `0` (disabled). If you use `audio_bus_override` on `Area2D`/`Area3D` with the default mask you must set the mask back to layer 1 | affects 2D Area2D audio bus overrides |
| Animation: `AnimationNodeBlendSpace1D/2D` boolean `sync` replaced by `sync_mode` enum; re-check blend spaces if transitions look wrong | |
| Platforms: minimum macOS to run Godot raised from 10.13 to 11 | |
| Jolt (3D only): `WorldBoundaryShape3D` plane distance sign flipped, `SoftBody3D` mass/stiffness changes, `Area3D` reports `SoftBody3D` overlaps | not applicable to a 2D game |

### Changed defaults (4.7)

| Default | Old -> New |
|---|---|
| Project stretch mode / aspect for **newly created** projects (`display/window/stretch/mode`, `display/window/stretch/aspect`) | `disabled`/`keep` -> `canvas_items`/`expand` |
| `RichTextLabel.add_image/update_image` `width_in_percent`/`height_in_percent` default | `false` -> `0` (the new unit parameter) |
| `ProjectSettings rendering/reflections/sky_reflections/roughness_layers` | 7 -> 8 |
| `LookAtModifier3D.relative` | `true` -> `false` |
| `ResourceImporterDynamicFont.hinting` | 1 -> 3 |

## 4.7.x patch releases (4.7.1 is the pin)

Source: https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md (sections `## 4.7.2 - 2026-08-17`, `## 4.7.1 - 2026-07-14`)

There is no separate "Upgrading 4.7.0 -> 4.7.1" page in the migration index (index lists `upgrading_to_godot_4` ... `upgrading_to_godot_4.7` only: https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/index.rst). The changelog items for 4.7.1 and 4.7.2 are fixes. Relevant ones:

| In | Item (verbatim bullet) | Area |
|---|---|---|
| 4.7.1 | "Fix issues in some `Container` types related to maximum size" | UI |
| 4.7.1 | "Fix `BoxContainer` not using `get_bound_minimum_size` when calculating layout" | UI |
| 4.7.1 | "Fix Tree item edit canceled instantly on scroll" ; "Fix SpinBox not calling base Range::_value_changed" | UI |
| 4.7.1 | "Fix scene tree drag-n-drop regression on touchscreens" ; "Fix Tree node mouse dragging regression on touchscreens" | touch |
| 4.7.1 | "Don't automatically open virtual keyboard when popup menu shows" ; "Fix backspace being unable to delete pre-existing text in any input field when using a soft keyboard on Android" | touch / soft keyboard |
| 4.7.1 | "Fix incorrect per-instance shader parameters when exporting in headless mode" | headless export |
| 4.7.1 | "Fix `hint_default_transparent` used with `sampler2DArray`" | rendering |
| 4.7.2 | "Fix `BaseButton` input when `enable_long_press_as_right_click` is true" | UI / touch |
| 4.7.2 | "Fix children's `parent_maximum_size_cache` unable to update twice in a frame" ; "Prevent stale updates to parent maximum size cache" | UI |
| 4.7.2 | "Remove `emscripten_cancel_main_loop` from web `exit_callback`" | web |
| 4.7.2 | "Update `DirAccess::create_temp` to not fail on empty `prefix` parameter" | files |

Consequence (inference, rests on the two lists above): the Container/maximum-size and touch-drag fixes landed in 4.7.1 and 4.7.2, so 4.7.0 UI layout/touch bugs may not apply to the 4.7.1 pin, while the 4.7.2 `BaseButton` long-press and `parent_maximum_size_cache` fixes are NOT in 4.7.1.
