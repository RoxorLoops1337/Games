# Deprecated / Removed / Renamed APIs

Last verified: 2026-10-25

Rule: a row exists only if a fetched page marks it deprecated, removed or renamed. "Don't use" -> "Use".

Two sources:
- **Upgrade guides** (renamed/removed between versions): https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.4.rst (also `_4.5`, `_4.6`, `_4.7`)
- **Class reference at tag `4.7.1-stable`**: the `deprecated="..."` attribute in `doc/classes/*.xml` and `modules/gdscript/doc_classes/*.xml` of https://github.com/godotengine/godot.git (rendered: https://docs.godotengine.org/en/4.7/classes/). The attribute text is quoted; the XML does NOT say in which version the deprecation started. NOT SOURCEABLE — deprecation start version of the class-reference rows, not stated at the class XML (`deprecated="..."` carries only the replacement text).

## GDScript global functions (`@GDScript`)

Source: `modules/gdscript/doc_classes/@GDScript.xml` @ 4.7.1-stable. For `type_exists`: the 4.7 changelog bullet "Deprecate `type_exists()` global function" (https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md, 4.7 section).

| Don't use | Use |
|---|---|
| `type_exists(name)` | `ClassDB.class_exists()` |
| `convert(value, type)` | `type_convert()` (`@GlobalScope`) |
| `Color8(r, g, b, a)` | `Color.from_rgba8()` |
| `inst_to_dict()` | "Consider using `JSON.from_native()` or `Object.get_property_list()`" |
| `dict_to_inst()` | "Consider using `JSON.to_native()` or `Object.get_property_list()`" |

## Save data / files / strings

Source: class XML @ 4.7.1-stable.

| Don't use | Use |
|---|---|
| `PackedDataContainer`, `PackedDataContainerRef` (classes) | `var_to_bytes()` or `FileAccess.store_var()`; for compression `PackedByteArray.compress()` or `FileAccess.open_compressed()` |
| `String.is_valid_identifier()` / `StringName.is_valid_identifier()` | `is_valid_ascii_identifier()` |
| `Image.create()` | `Image.create_empty()` |
| `FileAccess.get_as_text(skip_cr)` argument (removed 4.6) | `get_as_text()` without the argument (source: upgrading_to_godot_4.6.rst) |
| Reading `FileAccess.store_*` as `void` | They return `bool` since 4.4 (source: upgrading_to_godot_4.4.rst) |

NOT SOURCEABLE — a deprecation/rename of `JSON`, `ResourceSaver`, `ConfigFile` or `DirAccess` methods between 4.3 and 4.7.1, not stated at the class XML (no `deprecated=` attribute found on those classes in the 4.7.1-stable XML) nor in the four upgrade guides (only the `FileAccess`/`DirAccess.create_temp` entries above).

## Node / Control / UI

Source: class XML @ 4.7.1-stable unless noted.

| Don't use | Use |
|---|---|
| `TileMap` (class) | Multiple `TileMapLayer` nodes (editor has a conversion command in the TileMap bottom panel toolbox) |
| `TileMap.force_update()` | `notify_runtime_tile_data_update()` and/or `update_internals()` |
| `TileMap.get/set_navigation_map()` | `get/set_layer_navigation_map()` |
| `TileData.get/set_occluder()` | `get/set_occluder_polygon()` |
| `PopupMenu.add_submenu_item()` / `get_item_submenu()` / `set_item_submenu()` | `add_submenu_node_item()` / `get_item_submenu_node()` / `set_item_submenu_node()` |
| `SplitContainer.split_offset` | `split_offsets` (first element = offset between first two children) |
| `SplitContainer.get_drag_area_control()` | first element of `get_drag_area_controls()` |
| `RichTextLabel.is_ready()` | `is_finished()` |
| `TreeItem.set_custom_draw()` | `set_custom_draw_callback()` |
| `TabContainer.all_tabs_in_front` | nothing (does nothing; tabs always in front) |
| `Control.auto_translate` / `Window.auto_translate` | `Node.auto_translate_mode` and `Node.can_auto_translate()` |
| `Control.LAYOUT_DIRECTION_LOCALE` / `Window.LAYOUT_DIRECTION_LOCALE` | `LAYOUT_DIRECTION_APPLICATION_LOCALE` |
| `TextEdit.background_color` theme item | Assign a `StyleBoxFlat` to theme item `normal` and set `bg_color` |
| `TextEdit.get_selection_line()` / `get_selection_column()` | `get_selection_origin_line()` / `get_selection_origin_column()` |
| `TextEdit.adjust_carets_after_edit()`, `get_caret_index_edit_order()` | not needed; use `get_sorted_carets()` if sorting is required |
| `SpinBox` theme item `updown` | theme items `up` and `down` |
| `SpinBox` theme item `set_min_buttons_width_from_icons` | set `buttons_width` to a negative value |
| `ColorPicker.MODE_RAW` | `MODE_LINEAR` |
| `Node.NOTIFICATION_MOVED_IN_PARENT` | `NOTIFICATION_CHILD_ORDER_CHANGED` |
| `Viewport.push_unhandled_input()` | `push_input()` |
| `Window.move_to_foreground()` | `Window.grab_focus()` |
| `Resource.setup_local_to_scene()` | internal only; override `_setup_local_to_scene()` |
| `DisplayServer.global_menu_*`, `FEATURE_GLOBAL_MENU` | `NativeMenu` or `PopupMenu` |
| `DisplayServer.accessibility_*` methods and `ROLE_*`, `FLAG_*`, `ACTION_*`, `LIVE_*`, `SCROLL_*`, `POPUP_*` constants | `AccessibilityServer` (the `Control.accessibility_live` type moved there in 4.7: upgrading_to_godot_4.7.rst) |

## Animation / 2D nodes

Source: class XML @ 4.7.1-stable.

| Don't use | Use |
|---|---|
| `AnimationPlayer.get/set_process_callback()`, `ANIMATION_PROCESS_*` | `AnimationMixer.callback_mode_process`, `AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_*` |
| `AnimationPlayer.get/set_method_call_mode()`, `ANIMATION_METHOD_CALL_*` | `AnimationMixer.callback_mode_method`, `ANIMATION_CALLBACK_MODE_METHOD_*` |
| `AnimationPlayer.get/set_root()` | `AnimationMixer.root_node` |
| `AnimationTree.get/set_process_callback()` | `AnimationMixer.callback_mode_process` |
| `AnimationNodeBlendSpace1D/2D.sync` | `sync_mode` (4.7 behaviour note in upgrading_to_godot_4.7.rst) |
| `SpriteFrames.get/set_animation_loop()` | `get/set_animation_loop_mode()` |
| `AnimatedTexture` (class) | no replacement: "does not work properly in current versions and may be removed ... no equivalent workaround" |
| `AStarGrid2D.size` | `region` |
| `NavigationRegion2D.get_region_rid()` | `get_rid()` |
| `NavigationPolygon.make_polygons_from_outlines()` | `NavigationServer2D.parse_source_geometry_data()` + `bake_from_source_geometry_data()` |
| `NavigationServer2D.map_force_update()` | no longer supported (incompatible with async updates) |
| `MultiMesh.transform_2d_array`, `color_array`, `custom_data_array`, `transform_array` | `set/get_instance_transform_2d()`, `set/get_instance_color()`, `set/get_instance_custom_data()`, `set/get_instance_transform()` ("very slow") |

## Rendering / text

Source: class XML @ 4.7.1-stable, upgrade guides.

| Don't use | Use |
|---|---|
| `TextServer.font_get/set_global_oversampling()` | `Viewport` oversampling or the `oversampling` argument of `draw_*` methods |
| `TextServer.format_number()`, `parse_number()`, `percent_sign()` | `TranslationServer.format_number()`, `parse_number()`, `get_percent_sign()` |
| `TextServer.BREAK_TRIM_EDGE_SPACES` | `BREAK_TRIM_START_EDGE_SPACES \| BREAK_TRIM_END_EDGE_SPACES` |
| `RenderingServer.set_boot_image()` | `set_boot_image_with_stretch()` |
| `RenderingServer.instance_set_interpolated()`, `instance_reset_physics_interpolation()` | removed in 4.5 (upgrade guide gives no replacement: NOT SOURCEABLE — replacement API, not stated at upgrading_to_godot_4.5.rst) |
| `ResourceImporterTexture` `process/normal_map_invert_y` | `process/channel_remap/green` = `Green Inverted` |
| `AudioEffectLimiter` | `AudioEffectHardLimiter` |

## Renamed/removed between versions (upgrade guides)

| Old | New | Version |
|---|---|---|
| `Node.get_rpc_config()` | `get_node_rpc_config()` | 4.5 |
| `JSONRPC.set_scope()` | `set_method()` | 4.5 |
| `RichTextLabel.add_image/update_image` `size_in_percent` | `width_in_percent` + `height_in_percent` (4.5), then `width_unit` + `height_unit` of enum `RichTextLabel.ImageUnit` (4.7) | 4.5 / 4.7 |
| `RichTextLabel.ImageUpdateMask.UPDATE_WIDTH_IN_PERCENT` | `UPDATE_WIDTH_UNIT` | 4.7 |
| `@export_file` yielding `res://` | `@export_file_path` for raw `res://` paths | 4.4 / 4.5 |
| `AudioEffectSpectrumAnalyzer.tap_back_pos` | removed, no replacement stated | 4.7 |
| Mouse/keyboard `InputEvent.device == 0` | `InputEvent.DEVICE_ID_MOUSE` / `DEVICE_ID_KEYBOARD` | 4.7 |
| `Resource.duplicate(true)` (deep, external too) | `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` | 4.5 |
