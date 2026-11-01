# Module: UI (Control, containers, themes, touch)

Last verified: 2026-10-25

Sources: upgrade guides 4.4-4.7 (https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.7.rst and siblings); class reference XML at tag `4.7.1-stable` (`doc/classes/Control.xml`, `VirtualJoystick.xml`, from https://github.com/godotengine/godot.git); changelog https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md.
The UI tutorial pages (`tutorials/ui/*.rst`, branch `4.7`) were listed but contain no per-version change notes except the macOS system-menu note under "4.6".

## API / default changes affecting Control-based UI

| Version | Change | Action |
|---|---|---|
| 4.4 | `RichTextLabel.push_meta` + optional `tooltip`; `set_table_column_expand` + optional `shrink` | none |
| 4.4 | `GraphEdit.frame_rect_changed` signal arg `Vector2` -> `Rect2` | update handler |
| 4.5 | `RichTextLabel.add_image`/`update_image`: `size_in_percent` split into `width_in_percent`/`height_in_percent` (old value now only sets width; height defaults `false`) | pass both explicitly |
| 4.5 | `RichTextLabel.add_image` `alt_text`; `push_table` `name`; `push_underline`/`push_strikethrough` optional `color`; `TreeItem.add_button` `alt_text` | optional |
| 4.5 | `CanvasItem.draw_string*` / `Font.draw_*` optional `oversampling` | optional |
| 4.6 | `Control.grab_focus(hide_focus=...)`, `Control.has_focus(ignore_hidden_focus=...)`, `LineEdit.edit(hide_focus=...)` | optional |
| 4.6 | `PopupMenu.submenu_popup_delay` default 0.3 -> 0.2 | set explicitly if timing matters |
| 4.6 | `SplitContainer.clamp_split_offset(priority_index)` | optional |
| 4.6 (docs) | macOS: `PopupMenu.system_menu_id` lets you add items to Application/Window/Help/Dock menus (`creating_applications.rst`) | desktop only |
| 4.7 | `RichTextLabel.add_image`/`update_image`: `width`/`height` are `float`; `*_in_percent` bool -> `width_unit`/`height_unit` (`RichTextLabel.ImageUnit`); `UPDATE_WIDTH_IN_PERCENT` -> `UPDATE_WIDTH_UNIT` | update calls |
| 4.7 | `TreeItem.select(set_as_cursor=...)` | optional |
| 4.7 | `Control.accessibility_live` type moved to `AccessibilityServer.AccessibilityLiveMode` | update enum refs |
| 4.7 | Default stretch mode/aspect for NEW projects: `canvas_items` / `expand` (were `disabled` / `keep`) | set `display/window/stretch/*` explicitly |
| 4.7 | `CanvasItem` lines drawn without antialiasing feather (thinner) | adjust widths |
| 4.7 | Mouse/keyboard `InputEvent.device` constants | see `breaking-changes.md` |

## New UI APIs listed for 4.7

Source: 4.7 section of the changelog ("GUI" group) for the one-line names; class XML @ 4.7.1-stable where marked (X).

| Item (changelog text) | Detail |
|---|---|
| "Add `custom_maximum_size` property to `Control`" (X) | Vector2, default `(-1,-1)` = no maximum; has priority over `custom_minimum_size`; effective max may be limited by parent Container; recommended to use `get_bound_minimum_size()` instead of `get_combined_minimum_size()` with it; not all Control subtypes handle it gracefully |
| "Add transform offset to Control nodes" | name only; semantics NOT SOURCEABLE — not stated at the changelog |
| "Add VirtualJoystick", "Add Styleboxes for Virtual Joystick" (X) | `VirtualJoystick`: on-screen joystick for touch devices; can simulate actions via `action_up/down/left/right` (defaults like `ui_down`); signals `pressed`, `released(input_vector)`, `flicked(input_vector)`, `flick_canceled` |
| "Add scroll switch to ScrollContainer" | name only; semantics NOT SOURCEABLE — not stated at the changelog |
| "Add translation context to Controls", "Add `_get_tooltip_auto_translate_mode_at()` to Control", "Add virtual `_get_cursor_shape()` method in Control" | names only |
| "Implement search bar for `PopupMenu`", "Implement fuzzy search for `PopupMenu` search bar", "Add PopupMenu method `set_item_index`" | names only |
| "Support tiling `AtlasTexture` in `TextureRect`", "Add conic gradient to GradientTexture2D", "Add `fix_alpha_border` and `premult_alpha` to the `DPITexture` importer" | names only |
| "Add option to scale images in RichTextLabel relative to font size", "Improve the table in `RichTextLabel`", "Add triple-click paragraph selection to RichTextLabel" | names only |
| "Add property to auto adjust oversampling with canvas item scale" | name only |
| "Make the resource type's default theme item editable in Theme editor" | name only (editor) |
| "Change TabContainer's popup button into real Button"; "Deprecate `TabContainer.all_tabs_in_front` due to now being useless" | see `deprecated-apis.md` |
| "Make internal children of built-in nodes use their parent's material" | name only |

## Patch fixes that matter for UI/touch (pin is 4.7.1)

| In | Fix text | In 4.7.1? |
|---|---|---|
| 4.7.1 | "Fix issues in some `Container` types related to maximum size"; "Fix `BoxContainer` not using `get_bound_minimum_size` when calculating layout" | yes |
| 4.7.1 | "Fix Tree item edit canceled instantly on scroll"; "Fix SpinBox not calling base Range::_value_changed"; "Make the OptionButton match the width of the pop-up menu"; "Fix crash in `Tree::_get_item_focus_rect`"; "Fix visual glitch with connections lines in `GraphEdit`" | yes |
| 4.7.1 | "Fix scene tree drag-n-drop regression on touchscreens"; "Fix Tree node mouse dragging regression on touchscreens"; "Don't automatically open virtual keyboard when popup menu shows"; "Fix backspace being unable to delete pre-existing text in any input field when using a soft keyboard on Android" | yes |
| 4.7.1 | "RTL: Improve `img=` and `font=` tags parsing"; "TextServer: Fix some emoji sequences with skin tone modifier not rendered correctly" | yes |
| 4.7.2 | "Fix `BaseButton` input when `enable_long_press_as_right_click` is true"; "Fix children's `parent_maximum_size_cache` unable to update twice in a frame"; "Prevent stale updates to parent maximum size cache" | NO (4.7.2 only) |

## Deprecated UI APIs

See `deprecated-apis.md` > "Node / Control / UI" (TileMap, PopupMenu submenu methods, SplitContainer.split_offset, TextEdit.background_color theme item, SpinBox `updown`, `Control.auto_translate`, etc.).

## Gaps

NOT SOURCEABLE — Theme / StyleBox / ThemeDB breaking changes between 4.3 and 4.7.1: the four upgrade guides list none besides the defaults above (`PopupMenu.submenu_popup_delay`), and the class XML marks only `TextEdit.background_color`, `SpinBox.updown`, `SpinBox.set_min_buttons_width_from_icons` theme items deprecated.
NOT SOURCEABLE — touch gesture/pinch/`InputEventScreenTouch` API changes since 4.3, not stated at the upgrade guides.
NOT SOURCEABLE — the semantics of "transform offset" and "scroll switch" (above), not stated at the changelog.
