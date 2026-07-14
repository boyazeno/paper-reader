# Paper Reader — Android (Capacitor)

An Android companion for the desktop Paper Reader. It reuses the desktop
renderer's platform-agnostic logic (store, prompts, retrieval, PDF extraction,
notes, search) and replaces the Electron `window.api` with a Capacitor-backed
implementation (`src/api/mobileApi.ts`). The vault format is identical, so a
vault syncs between desktop and phone.

## Architecture

- **The seam** is `window.api` (typed `Api` in `src/api/apiTypes.ts`, mirroring
  the desktop preload bridge). `installMobileApi()` in `src/main.tsx` installs a
  Capacitor implementation before the React app mounts.
- **Vault I/O** goes through the `VaultFs` plugin (SAF, a user-picked folder);
  every path is POSIX-relative to that folder. See `src/api/vaultFs.ts` + the
  native `android-plugins/VaultFsPlugin.kt`.
- **LLM** streams via the WebView's native fetch/SSE (`src/api/llmStream.ts`);
  keys live in the Android Keystore (`src/api/secrets.ts`).
- Reused desktop source is aliased in via `@renderer/*` and `@shared/*`
  (see `vite.config.ts` / `tsconfig.json`) pointing at `../src`.

## Prerequisites

- Node 18+, Android Studio + SDK (API 34), a JDK 17.
- `minSdk 26` (Keystore + SAF).

## First-time setup

```bash
cd mobile
npm install
npm run build                 # produces dist/
npx cap add android           # generates android/ (Gradle project)
```

Then wire up the two custom native plugins:

1. Copy the staged Kotlin sources into the Android app package:
   ```bash
   mkdir -p android/app/src/main/java/de/unituebingen/paperreader/mobile
   cp android-plugins/*.kt \
      android/app/src/main/java/de/unituebingen/paperreader/mobile/
   ```
2. Register both custom plugins in `MainActivity.kt`:
   ```kotlin
   class MainActivity : BridgeActivity() {
     override fun onCreate(savedInstanceState: Bundle?) {
       registerPlugin(VaultFsPlugin::class.java)
       registerPlugin(ScholarWebViewPlugin::class.java)
       registerPlugin(GitHttpPlugin::class.java)
       registerPlugin(GitNativePlugin::class.java)
       super.onCreate(savedInstanceState)
     }
   }
   ```
3. In `android/app/build.gradle` add the SAF + native-git dependencies and
   core-library desugaring (JGit uses newer JDK APIs):
   ```gradle
   android {
     compileOptions {
       coreLibraryDesugaringEnabled true
       sourceCompatibility JavaVersion.VERSION_17
       targetCompatibility JavaVersion.VERSION_17
     }
   }
   dependencies {
     implementation "androidx.documentfile:documentfile:1.0.1"
     implementation('org.eclipse.jgit:org.eclipse.jgit:6.7.0.202309050840-r') { exclude group: 'org.slf4j' }
     implementation 'org.slf4j:slf4j-nop:1.7.36'
     coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.0.4'
   }
   ```
4. Generate the launcher icon + splash from the shared desktop icon (source is
   `assets/icon.png`, the PC app's `build/icon.png` upscaled to 1024²):
   ```bash
   npx capacitor-assets generate --android \
     --iconBackgroundColor '#4f46e5' --iconBackgroundColorDark '#4f46e5'
   ```
   (`#4f46e5` is the icon's indigo tile, so the adaptive-icon mask blends.)
5. If you use an `http://` LLM/git endpoint (LAN gateway, Ollama), allow
   cleartext for it. Either set `android:usesCleartextTraffic="true"` on
   `<application>` in `AndroidManifest.xml`, or add a network-security-config
   scoped to your host. HTTPS providers (Claude/OpenAI/OpenRouter/GitHub) need
   nothing extra.

## Dev loop

```bash
npm run build && npx cap copy android      # ship web assets into the app
npx cap run android                        # build + install on device/emulator
# or live-reload against the Vite dev server:
npx cap run android --live-reload --external
```

## Building an APK

Debug (installable for testing):

```bash
npm run build && npx cap copy android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Signed release:

```bash
keytool -genkey -v -keystore paper-reader.keystore \
  -alias paperreader -keyalg RSA -keysize 2048 -validity 10000
```

Add a `signingConfigs.release` in `android/app/build.gradle` (keystore path +
passwords, ideally via a git-ignored `keystore.properties`), wire it into
`buildTypes.release`, then `./gradlew assembleRelease`. Requires **JDK 17** (AGP
8) — a newer JDK often fails the Gradle build. Or open in Android Studio
(`npx cap open android`) and use **Build ▸ Generate Signed Bundle/APK**.

## Typechecking

- `npm run typecheck:api` — the platform (api) layer + shared domain only
  (used while the reused renderer UI is being wired in).
- `npm run typecheck` — the whole app including reused renderer components.

## Status

- **M1 (done)**: scaffold, VaultFs (SAF) + api port (project/library/settings/
  session/intake/secrets/llm stream). Vault round-trip verified.
- **M2 (done)**: `AppShell` + `Home` (import by URL / file / recents) and
  `ReaderMobile` — single-column reader with a PDF⇄Translation toggle, reusing
  the desktop `PdfPage` (canvas + selectable text layer + block overlays) and
  `TranslatedBlock` (KaTeX). Pinch-to-zoom; tapping a block anchors both views.
  Verified headlessly (Chromium): PDF renders, blocks extract, toggle + active-
  block sync + math rendering all work.
- **M3 (done)**: `SettingsMobile` (provider / model / base URL / API key in the
  Keystore / target language / theme / inspire prompt / connection test) and the
  reader's LLM actions — reused `ResultPanel` (summary/inspire) and `ChatPanel`
  (explain, whole-paper vs RAG), operating on the tapped block or whole paper.
  Verified headlessly against a mock OpenAI-compatible SSE provider: streaming,
  CORS, and the explain chat render correctly. (CSP `connect-src` allows http:
  so LAN/self-hosted endpoints work.)
- **M4 (done)**: long-press **multi-select** (selection bar → Summary / Inspire /
  Explain, reusing the selection→text join); **Library** (`searchBookmarks` /
  `allTags` / `TagEditor`, tag cloud, open/remove) + a bookmark sheet; **Notes**
  (reused TipTap + KaTeX bottom sheet) with **PDF-region screenshot** — cropping
  the rendered page canvas → `saveImage` → inserted image. Verified headlessly:
  long-press selection, and crop→save→insert all work.
- **M5 (done)**: **Git sync** via isomorphic-git over a VaultFs `fs` adapter
  (`gitFs`) — stage → commit → fetch → merge → push, HTTPS + PAT auth, optional
  CORS proxy; a Git section in Settings. Local git ops verified headlessly
  (init/add/commit/status over the adapter). **Scholar Inbox** — a native
  `ScholarWebViewPlugin` (persistent cookies, PDF-link interception) overlaid
  below a React toolbar (`ScholarView`), intercepted PDFs import as a paper;
  login link validated to scholar-inbox.com and stored in the Keystore.
  Git HTTP goes through a native transport (`GitHttpPlugin`, HttpURLConnection)
  so it talks straight to the host with no WebView CORS and no proxy.
  *Network git push/fetch and the native WebView require an on-device run.*
- **M6 (done)**: session restore (reopen the last paper + scroll on launch,
  persisted on background), live system-theme following, a one-time mobile
  first-run hint (replacing the desktop spotlight tour), and APK build/signing
  docs (above). Verified headlessly: first-run hint + session persist.

All six milestones complete. Remaining work is on-device only: run the two
native plugins on an emulator/device, and exercise git push/fetch against a
real remote.
