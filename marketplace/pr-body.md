## Plugin

- **Repo:** https://github.com/tangu2023/dsh-menu
- **Category:** `ui`
- **Package name:** `dsh-menu`

## What it does

Adds a custom right-click context menu to the Web UI sidebar's workspace files tree, replacing the browser default menu: new folder, rename, reveal in file manager, open in browser, open in VS Code, copy path, streaming ZIP download (works for a file **and** for a folder), and delete with a confirmation step. Glass card, zh/en localized, follows the light and dark theme.

## Listing requirements

- [x] Declares a `dsh.bundle` manifest in `package.json`, with `cordis.patch.yml` beside it. It also declares `dsh.client` because it ships the browser half.
- [x] Real, working code — no placeholder. No build step and no third-party dependencies at all.
- [x] Repo created 2026-10-01, so older than 1 day.
- [x] Tagged with the `dsh-plugin` topic.

## Install verification

Installed from the repo into a scratch profile:

```
$ dsh plugin --profile markettest add github:tangu2023/dsh-menu
+ dsh-menu 1.0.0
Done in 8.1s
```

The profile recorded the bundle in `dsh.profile.bundles`, and the layer resolves:

```
# == dsh-menu
- id: workspace-files-menu
  name: dsh-menu
```

No `allowBuilds` entry was needed: the package has zero dependencies and no `prepare` script, so nothing runs at install time.
