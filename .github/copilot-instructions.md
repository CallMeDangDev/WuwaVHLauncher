# WuwaVH Launcher – Project Guidelines

WPF + WebView2 launcher for the Wuthering Waves Vietnamese localization mod.
Architecture: **C# backend** (WPF, `MainWindow.xaml.cs`) + **HTML/JS/CSS frontend** served via WebView2.
The backend exposes a `LauncherBridge` COM-visible class to JS via `window.chrome.webview.hostObjects.launcher`.

## Build & Publish

```bash
# Development
dotnet build -c Debug

# Release (single-file self-contained exe, ~45 MB)
dotnet publish WuwaVHLauncher.csproj -c Release -o ./publish
```

Expected: **0 errors**. One pre-existing warning `CS8603` at MainWindow.xaml.cs:796 is known and acceptable.
Always run `dotnet build -c Debug` after code changes to verify.

## Architecture

```
App.xaml.cs              # Entry, single-instance mutex, anti-debugger
MainWindow.xaml.cs       # All C# logic: bridge methods, game detection, install, update
WuwaPakPacker.cs         # Wuthering Waves PAK v12 format (font packaging)
Resources/Web/           # Frontend — served XOR-encrypted from embedded assembly resources
  index.html             # HTML shell
  script-core.js         # Global state (S), bridge() helper, DOMContentLoaded init
  script-nav.js          # Tab switching, admin modal, nav wave indicator
  script-home.js         # Install/update flow, game path, countdown, audio player
  script-fx.js           # Particle canvas, water ripple effects
  script-misc.js         # Launcher self-update modal, misc callbacks
  styles-base.css        # CSS variables, resets, typography
  styles-panel.css       # Right panel, buttons, progress, top bar, modals
  styles-effects.css     # Particle/ripple/wave animations
  styles-font.css        # Font creator page (.fc-*)
```

## Bridge Pattern (JS ↔ C#)

**JS → C#:** always `await bridge().MethodName(args)`.
```js
const bridge = () => window.chrome?.webview?.hostObjects?.launcher;
const result = await bridge().StartInstallation(gamePath, "modern", false);
```

**C# → JS:** via `RunScript()`.
```csharp
_w.RunScript($"window.onInstallComplete()");
_w.RunScript($"window.onProgressUpdate({pct}, {JsStr(name)}, {JsStr(speed)}, {JsStr(size)})");
```

**Key `window.on*` callbacks C# fires into JS:**
`onGamePathDetected` · `onProgressUpdate` · `onInstallComplete` · `onInstallError` ·
`onLauncherUpdateAvailable` · `onLauncherUpdateProgress` · `onLauncherUpdateError` ·
`onFontPakProgress` · `onFontPakDone` · `onFontPakError` · `onFontRevertDone` · `onFontRevertError`

## Conventions

**Adding a new bridge method (C#):**
1. Add `public` method or property to the `LauncherBridge` class in `MainWindow.xaml.cs`.
2. Long operations: use `Task.Run()` + `_w.RunScript(...)` callbacks — never block UI thread.
3. Call it from JS via `await bridge().NewMethod(...)`.

**Adding a new tab/page:**
1. Add nav `<button data-page="my-page">` in `index.html`.
2. Add `<div id="pageMyPage" class="page-overlay" style="display:none;">` HTML.
3. Add CSS to the appropriate `styles-*.css` file.
4. Add JS logic to a `script-*.js` file; register in `switchPage()` in `script-nav.js`.
5. Reference new CSS/JS in `index.html`; build — MSBuild XOR-encrypts them automatically.

**Toast notifications (JS):**
```js
toast('Message', 'ok');   // green
toast('Message', 'err');  // red
toast('Message', 'info'); // blue
```

**Modals (JS):** use `showConfirm(msg)` or `showAdminModal()` (both return Promises).

**CSS naming:** BEM-style prefixes per feature — `gfx-`, `fc-`, `ap-`, `rp-`, `lu-`, `uc-`.

**Settings storage:** `C:\Users\{User}\AppData\Local\WuwaVHLauncher\settings.json`
Persist via `bridge().SaveSettings(JSON.stringify(cfg))`; load via `bridge().LoadSettings()`.

## XOR-Encrypted Resources

Web files in `Resources/Web/` are XOR-encrypted at **build time** with key `WuwaVH@2026!xK9#mQ`
and embedded into the assembly. At runtime `OnWebResourceRequested` decrypts them in memory
and serves them at `https://app.local/`. Files are **never written to disk**.

> Do not add plaintext web files to the publish output. Always reference web assets from `Resources/Web/`;
> the MSBuild task handles encryption automatically.

## Key Gotchas

- **Anti-debugger:** App exits silently if a debugger is attached. Use `Debug` build for development — DevTools are enabled automatically in Debug config.
- **Single instance:** Mutex `WuwaVHLauncher_SingleInstance` prevents duplicate launches.
- **Game path detection** only scans C:, D:, E: drives + Program Files. For any other drive, the user must pick manually.
- **Font creator** deletes ALL `*_100_P.pak` files before installing a new font. This is intentional.
- **Full downloads only** — no delta patching. Each install/update fetches complete mod files.
- **Admin check** is done before any tab requiring elevated access; never at the point of file write.
