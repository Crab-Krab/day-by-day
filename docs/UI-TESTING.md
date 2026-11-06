# UI improvements: testing

This branch changes the saving panel, task entry, spacing, task actions, ordering labels, and completed sections. The task-data format is unchanged.

## Dependency-free checks

Run `npm test` and `npm run build`. The UI suite covers compact task entry, preserving optional fields, reordering scope, visible focus after completion, collapsed sections across changes/navigation, and closing a dialog whose animation never finishes. File-storage checks cover compact saving status, automatically expanded recovery controls, and edits made during a slow startup connection.

The existing scheduling, history, reminder, recovery, theme, and file-storage suites still run.

## Real-browser checks

The **UI browser checks** workflow runs on pushes to `codex/ui-ux-improvements`. It opens the generated standalone HTML in Chromium and Edge on Linux at 1366px and 390px widths, with ordinary and reduced motion. It checks all six improvements, dark mode, pointer hit targets, safe description links, 24 repeated edit/check cycles per width, failed file saves, and retry. It also uses real pointer and keyboard input to add tasks with Enter, check tasks at the edge of their hit targets, operate the action menu with Enter/Escape, and validate a required time in the full editor. Screenshots are saved as workflow artifacts.

To run the optional browser suite locally:

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run test:browser
```

Alternatively set `DAY_BY_DAY_PLAYWRIGHT_PATH` to an existing Playwright module directory. Set `DAY_BY_DAY_BROWSER_CHANNEL` to `msedge` to use an installed Edge. Set `DAY_BY_DAY_BROWSER_OUTPUT` to a screenshot output directory.

The runner serves only the test page and built app on a temporary loopback port. The test frame uses disposable sample tasks, simulated file handles, and simulated file permissions. It restores any original task/preference values on that test origin. It does not open a real task file. The normal app needs no packages or server.

To inspect the same checks interactively, serve this checkout locally and open `tests/ui-browser.html`, then choose **Run browser checks**.

## Manual follow-up

Native file pickers, permission renewal, and long-running real Edge sessions need manual verification. Immediate dialog closure and nonblocking startup reconnection address two possible causes of blocked checklist input; a short browser stress test does not establish that the intermittent Edge issue is fully resolved.
