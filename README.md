# Herdr Command Palette

Fuzzy palette for Herdr. Pick an open workspace or a project directory. If the
selected directory is already open in a workspace, Herdr focuses it; otherwise it
creates a workspace rooted at that directory.

## Install for local development

```bash
herdr plugin link "$PWD"
herdr plugin action list --plugin alonz.command-palette
```

## Bind a shortcut

```toml
[[keys.command]]
key = "prefix+space"
type = "plugin_action"
command = "alonz.command-palette.open"
description = "command palette"
```

Then reload:

```bash
herdr server reload-config
```

## Configure folders

First run creates:

```bash
herdr plugin config-dir alonz.command-palette
```

Edit `config.json` there:

```json
{
  "folders": ["~/Private/clones", "~/Private/things", "~/Projects"],
  "maxDepth": 1,
  "ignore": [".git", "node_modules", "dist", "build", ".next"],
  "sort": "priority"
}
```

`maxDepth = 1` scans direct child directories under each folder. Raise it only
for nested project trees; keep it small for fast palette startup.

`sort = "priority"` blends fuzzy score with open-workspace priority and zoxide
frequency when `zoxide` is installed. Use `"fuzzy"` for old pure fuzzy sorting.

## Machine-readable project catalog

The PiRemote daemon can discover the same configured directories without opening
Herdr's palette:

```bash
node /path/to/herdr-command-palette/src/catalog.js
```

The command prints `{ "projects": [{ "id", "name", "path" }] }` to stdout.
It resolves the plugin's config directory via `herdr plugin config-dir` and exits
nonzero if a configured root is unavailable (never treats scan failure as an
empty catalog). Set `HERDR_PLUGIN_CONFIG_DIR` to override this during testing.

## Check

```bash
npm test
```
