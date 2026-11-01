# Godot Engine Version Reference

Last verified: 2026-10-25

| Field | Value |
|---|---|
| **Engine Version** | 4.7.1 |
| **Project Pinned** | 2026-10-25 |
| **Installed at pin time** | NOT DETERMINED (Godot not installed in the authoring container) |
| **LLM Knowledge Cutoff** | May 2025 (training likely covers up to ~4.3) |
| **Risk Level** | HIGH (version beyond training data, reference docs required) |

## Is 4.7.1 a real release? YES (confirmed from primary sources)

Source: `git ls-remote --tags https://github.com/godotengine/godot.git` returned the tags `4.7-stable`, `4.7.1-stable`, `4.7.2-stable`.
Source: https://raw.githubusercontent.com/godotengine/godot/4.7.1-stable/version.py -> `major = 4`, `minor = 7`, `patch = 1`, `status = "stable"`, `docs = "4.7"`.
Source: https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md has a section `## 4.7.1 - 2026-07-14`.

**4.7.2 also exists and is newer** (see timeline). The pin (4.7.1) is NOT the latest 4.7.x patch. Per the 4.7.2 changelog it contains only fixes (no API additions listed); see `breaking-changes.md`.
Also: the `master` branch of the engine is already `4.8` with `status = "beta"` (https://raw.githubusercontent.com/godotengine/godot/master/version.py). Do not read 4.8-dev docs ("latest") as 4.7.1 docs; use the `/en/4.7/` docs.

## Post-cutoff release timeline

Dates below are taken from the engine's own `CHANGELOG.md` section headings (the 4.7.2 file for 4.7.x, per-tag files for earlier ones). The official release-post pages on godotengine.org could NOT be fetched (host unreachable from this container), so these are changelog-heading dates, which can differ by a day from the announcement date (example: 4.6 heading says 2026-01-26, git tag commit date is 2026-01-25).

| Version | Changelog date | Git tag commit date | Docs release table (month only) | Support level per docs (as of docs 4.7 branch) |
|---|---|---|---|---|
| 4.4 | 2025-03-03 | 2025-03-03 | March 2025 | EOL, last update 4.4.1 |
| 4.4.1 | 2025-03-26 | 2025-03-26 | - | - |
| 4.5 | 2025-09-15 | 2025-09-15 | September 2025 | partial (security + platform fixes only) |
| 4.5.1 | 2025-10-13 | 2025-10-13 | - | - |
| 4.5.2 | 2026-03-19 | 2026-03-18 | - | - |
| 4.6 | 2026-01-26 | 2026-01-25 | January 2026 | supported |
| 4.6.1 | 2026-02-16 | 2026-02-16 | - | - |
| 4.6.2 | 2026-04-01 | 2026-03-31 | - | - |
| 4.6.3 | NOT SOURCEABLE (the 4.6.3 changelog file has two headings both labelled "4.6.2": `2026-05-20` and `2026-04-01`) | 2026-05-20 | - | - |
| 4.7 | 2026-06-18 | 2026-06-17 | June 2026 | supported |
| **4.7.1** (pin) | **2026-07-14** | 2026-07-13 | - | - |
| 4.7.2 | 2026-08-17 | 2026-08-16 | - | - |
| 4.8 | not released | - | "Q4 2026 (estimate)", `master` is `beta` | development |

Sources:
- Changelogs: https://raw.githubusercontent.com/godotengine/godot/4.4.1-stable/CHANGELOG.md, .../4.5.2-stable/CHANGELOG.md, .../4.6.3-stable/CHANGELOG.md, .../4.7.2-stable/CHANGELOG.md
- Tag commit dates: `git fetch` of tags `4.4-stable` ... `4.7.2-stable` from https://github.com/godotengine/godot.git (commit date, not an announcement date)
- Support table: https://raw.githubusercontent.com/godotengine/godot-docs/master/about/release_policy.rst (rendered: https://docs.godotengine.org/en/stable/about/release_policy.html)
- Third-party hint only (not used for facts): a web search snippet gave 4.7.2 as "August 18, 2026"; this conflicts with the changelog (2026-08-17) so it is NOT used.

## Gaps

- NOT SOURCEABLE — official release-announcement pages and per-release feature highlights for 4.4 to 4.7, not stated at https://godotengine.org/releases/4.7/ (host did not resolve from the container; WebFetch error `getaddrinfo ENOTFOUND godotengine.org`). Only the 4.7.1 announcement link (https://godotengine.org/article/maintenance-release-godot-4-7-1) is known, from the changelog; its content was not read.
- NOT SOURCEABLE — which Godot version is installed locally, not stated anywhere (no Godot in the container).
- NOT SOURCEABLE — gdUnit4 version compatible with Godot 4.7.1, not stated in any Godot page fetched.

## Sources list (what was actually fetched)

How fetched: `WebFetch` failed for `docs.godotengine.org` and `godotengine.org` (DNS `ENOTFOUND`). The upstream sources of the same pages were fetched instead via HTTPS/git from GitHub (official godotengine org repos). The rendered docs URL is given for humans.

| Used for | Fetched from | Rendered/official equivalent |
|---|---|---|
| Upgrade guides 4.3->4.4 ... 4.6->4.7 | https://raw.githubusercontent.com/godotengine/godot-docs/master/tutorials/migrating/upgrading_to_godot_4.4.rst (also 4.5, 4.6, 4.7) | https://docs.godotengine.org/en/4.7/tutorials/migrating/upgrading_to_godot_4.7.html |
| Release policy / dates | https://raw.githubusercontent.com/godotengine/godot-docs/master/about/release_policy.rst | https://docs.godotengine.org/en/stable/about/release_policy.html |
| Version + patch notes | https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/CHANGELOG.md | https://godotengine.github.io/godot-interactive-changelog/ |
| Deprecated markers | class reference XML at git tag `4.7.1-stable` (`doc/classes/*.xml`, `modules/gdscript/doc_classes/*.xml`) from https://github.com/godotengine/godot.git | https://docs.godotengine.org/en/4.7/classes/ |
| Web export, GDScript, command line | `godot-docs` git branch `4.7` (commit 9adca4c, 2026-09-21), `tutorials/export/exporting_for_web.rst`, `tutorials/scripting/gdscript/*.rst`, `tutorials/editor/command_line_tutorial.rst` | https://docs.godotengine.org/en/4.7/ |
