# Changelog

All notable changes to DomasPad are documented here.

---

## [1.0.5] - 2026-10-26 — Patched Electron runtime

### Security fixes

- Replaced Electron 33.4.11 with pinned Electron 45.0.0, whose Chromium Brotli decoder includes the fix for CVE-2026-111497.
- Added a runtime check before development and packaging that verifies the pinned Electron version and the compiled decoder fix marker, including backported fixes.
- Updated electron-builder to 26.18.0 and refreshed the dependency lockfile.
- Updated esbuild to 0.28.2 to address its development-server advisory.
- Required patched, supported Node.js versions for development and documented reproducible installation with `npm ci`.

---

## [1.0.4] - 2026-03-14 — Security hardening

### Security fixes

- **Session path traversal** — `loadSession()` now restricts file-access grants to paths within the user's home directory. Previously, a tampered `session.json` could grant the app read/write access to arbitrary system files (e.g. `/etc/passwd`, `~/.ssh/id_rsa`).
- **DevTools disabled in production** — `toggleDevTools` is no longer present in the View menu in packaged builds. It remains available in development (`npm start`). Previously, any user could open DevTools and invoke IPC APIs directly.
- **Renderer sandbox enabled** — Added `sandbox: true` to `webPreferences`. The renderer process now runs with OS-level process isolation in addition to context isolation.
- **`webSecurity` explicitly enforced** — Added `webSecurity: true` to `webPreferences` to guard against future Electron defaults changing.
- **Permission requests denied** — Added `setPermissionRequestHandler` to reject all permission requests (camera, microphone, geolocation, notifications, etc.).
- **File size limit** — Files larger than 50 MB are now rejected before reading. Previously, opening a very large file could exhaust memory and crash the app.
- **Error messages sanitized** — File error dialogs no longer include the full file path, preventing path information disclosure.
- **Session data validation** — `sanitizeTabForSession()` now enforces types and bounds on all fields (`id`, `name`, `content`, `cursorPos`). The `session:save` IPC handler now validates `activeTabId` (must be string) and `theme` (must be `'dark'` or `'light'`).
- **IPC listener accumulation** — `preload.js` now calls `removeAllListeners()` before registering each menu event listener, preventing duplicate handler buildup if the registration functions are ever called more than once.
- **`innerHTML` removed from tab rendering** — `renderTabs()` now builds tab elements using DOM APIs (`createElement`, `textContent`). The `escapeHtml` helper has been removed as it is no longer needed.

---

## [1.0.3] - Previous release

- Renamed app from `notepad-macos` to `domaspad` in package metadata.

---

## [1.0.2] - Previous release

### Security hardening

- Added Content Security Policy header to `index.html`.
- Enabled `contextIsolation: true` and `nodeIntegration: false`.
- Added `setWindowOpenHandler` to block new window creation.
- Added `will-navigate` guard to block renderer navigation.
- Introduced `allowedFilePaths` allowlist for file I/O access control.
- Added `sanitizeTabForSession()` to strip unapproved file paths before persisting session.

---

## [1.0.1] - Previous release

- Bug fixes and stability improvements.

---

## [1.0.0] - Initial release

- Tab management with drag-and-drop reordering, middle-click close, and right-click context menu.
- CodeMirror 6 editor with syntax highlighting for 15+ languages.
- Session persistence: tabs, content, cursor positions, theme, and window state restored on relaunch.
- Dark and light themes (Cmd+Shift+D / Cmd+Shift+L).
- macOS native integration: hidden inset title bar, single instance lock, Finder file associations.
- Find & Replace (Cmd+F).
