# GoPlan Mobile — Codex Operating Manual

## 1. Scope

This file applies to `mobile/` and overrides root `AGENTS.md` for mobile-specific behavior.

## 2. Stack

- Expo SDK 57 (React Native), TypeScript 5 strict, Expo Router (file-based routing)
- When writing Expo/RN code, consult the versioned docs: https://docs.expo.dev/versions/v57.0.0/
- Styling: React Native `StyleSheet` + design tokens from `src/shared/theme/tokens.ts` — no NativeWind, no UI kits
- HTTP: Axios via `src/shared/api/client.ts` → **direct to Django** (no BFF; the BFF invariant applies to browsers only)
- Auth storage: refresh token in `expo-secure-store` (Keychain/Keystore) only; access token in-memory only. Never AsyncStorage for tokens. (P0)
- This is a native mobile app — no Next.js or web DOM assumptions.

## 3. iPhone 17 Pro Max Simulator Workflow

### Target rules

- The default mobile runtime and QA target is the existing **iPhone 17 Pro Max Simulator** on an installed compatible iOS runtime.
- A physical iPhone is no longer required for normal development. Use one only when the owner explicitly requests physical-device validation.
- Discover available runtimes and devices at the start of a simulator session; select the device by name and never commit its UDID.
- Reuse the existing iPhone 17 Pro Max Simulator. Do not create duplicate devices, download another multi-gigabyte runtime, or update Xcode merely to start a normal session without first reporting the need and obtaining owner approval.
- Never erase or delete a simulator/device/runtime without explicit owner approval. Shutdown is safe and should be used after testing to release RAM while preserving app data.
- Use the installed **GoPlan development build**, not App Store Expo Go. This project uses Expo SDK 57 and native dependencies that require its own development client.

### Preflight and simulator lifecycle

Run from `mobile/` unless a command says otherwise:

```bash
pnpm install
xcrun simctl list runtimes
xcrun simctl list devices available
```

- Confirm that an available `iPhone 17 Pro Max` and a compatible iOS runtime are already installed. If either is missing, report it before downloading or creating anything.
- If `.env` does not exist, copy `.env.example` to `.env`; never overwrite an existing real environment file.
- For the default Simulator workflow, set `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` in `.env` (no `/api` suffix) and expose the Django service on Mac port `8000`.
- Boot only when the target is currently `Shutdown`, then open the Simulator UI and wait until boot completes:

```bash
xcrun simctl boot "iPhone 17 Pro Max"
open -a Simulator
xcrun simctl bootstatus "iPhone 17 Pro Max" -b
```

When XcodeBuildMCP simulator tools are available, prefer them for discovery, build/run, accessibility inspection, screenshots, gestures, and logs. Set the project to `ios/GoPlan.xcodeproj`, scheme to `GoPlan`, and the runtime-discovered iPhone 17 Pro Max simulator ID; do not persist that ID in the repository.

### Build and install a new development version

Use this the first time, when the app is missing, or after native code/configuration changes:

```bash
pnpm exec expo run:ios --device "iPhone 17 Pro Max" --configuration Debug
```

The command builds the native iOS app, installs it in the selected Simulator, launches GoPlan, and starts Metro.

A rebuild is required when:

- a dependency containing native iOS code is added, removed, or upgraded;
- `app.json`, an Expo config plugin, entitlements, signing, or files under `ios/` change;
- the development build is missing or must be reinstalled.

A rebuild is **not** required for ordinary TS/TSX/JavaScript changes, Metro-served assets, or an `EXPO_PUBLIC_` value change.

### Daily development (existing dev build; no native rebuild)

```bash
pnpm exec expo start --dev-client --localhost
xcrun simctl launch "iPhone 17 Pro Max" com.anonymous.goplan
```

- Metro/Fast Refresh handles TS/TSX, JavaScript, styles, assets, and ordinary application logic.
- After changing an `EXPO_PUBLIC_` value, fully reload the development build. Use `pnpm exec expo start --dev-client --localhost --clear` only if Metro retains a stale value.
- If the app is not installed or `simctl launch` fails, run the Debug build command above instead of opening Expo Go.

### Release-like smoke build

This validates an embedded production bundle in the Simulator; it is not an App Store/TestFlight release and does not replace final physical-device validation when that is specifically required:

```bash
pnpm exec expo run:ios --device "iPhone 17 Pro Max" --configuration Release --no-bundler
```

Do not change the bundle identifier, Apple team, signing settings, deployment target, or Xcode configuration without owner approval.

### Simulator testing and `@Computer` fallback

Use this order for mobile verification:

1. Run the automated quality commands below.
2. If the repository has a purpose-built simulator E2E runner, use it for repeatable user journeys.
3. Otherwise, prefer XcodeBuildMCP simulator UI/debug tools when available because they expose app UI state, screenshots, gestures, and logs directly.
4. If no suitable E2E or dedicated simulator-control capability is available, use the owner-authorized **`@Computer` (Computer Use)** plugin to control the macOS `Simulator` app after the Debug/Release build launches.

When using `@Computer`:

- target the `Simulator` app and obtain a fresh app-state snapshot before interacting;
- prefer accessibility element indices when exposed; use screenshots and coordinates only when the accessibility tree is incomplete;
- refresh app state after each navigation or mutation instead of reusing stale coordinates;
- exercise the scoped journey with realistic data, including its primary success path, validation/error states, navigation back/forward, and relaunch/session behavior when relevant;
- capture screenshots or logs as evidence and clearly report which checks were automated versus performed through Computer Use.

Computer Use is a UI-control fallback, not a replacement for lint, type checking, unit tests, or an existing deterministic E2E suite.

### Shutdown and troubleshooting

After testing, release simulator resources without deleting data:

```bash
xcrun simctl shutdown "iPhone 17 Pro Max"
```

- **Wrong simulator opens:** inspect `xcrun simctl list devices available`, shut down the unintended device, and explicitly target `iPhone 17 Pro Max`.
- **No development server:** confirm Metro uses `--localhost`, Django is reachable at `127.0.0.1:8000`, and ports `8081` and `8000` are available.
- **Expo Go incompatibility:** close Expo Go and launch the installed GoPlan development build.
- **Build succeeds but the app does not open:** run `xcrun simctl launch "iPhone 17 Pro Max" com.anonymous.goplan`; then inspect simulator logs if it exits.
- **Stale JavaScript or environment value:** fully reload first; restart Metro with `--clear` only if needed.
- **Missing runtime or device:** stop and report the exact `simctl` output before downloading, creating, erasing, or deleting anything.

Official references: [local app development](https://docs.expo.dev/guides/local-app-development/), [using development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/), and [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

### Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## 4. Code Conventions

- TypeScript strict — no `any`, no unsafe assertions.
- Named exports by default. Exception: files in `src/app/` (Expo Router screens/layouts) use default exports; keep them thin re-exports of components in `src/features/<domain>/screens/`.
- Layout: `src/app/` (routes only) · `src/features/<domain>/` (screens, hooks, api, types) · `src/shared/` (api, ui, theme).
- Business logic must not live in screen components — put it in `src/features/` modules or `src/shared/api`.
- All colors/spacing/typography come from `src/shared/theme/tokens.ts`; no hardcoded values in components.
- Design language is native-first and intentionally independent from the web app's visual style.
- API error handling goes through `normalizeApiError` (`src/shared/api/errors.ts`); display backend messages as returned — never invent more specific ones (no user-enumeration leakage).
- Tests use `@testing-library/react-native` v14 — its render/fireEvent/rerender helpers are async and must be awaited.

## 5. Quality Gates

Every change: `pnpm lint` + `pnpm typecheck` + `pnpm test`.
Auth or navigation-gate changes additionally require a run on the iPhone 17 Pro Max Simulator (login → tabs → relaunch → logout), using dedicated simulator automation or `@Computer` when necessary.

## 6. Skill Usage

- `vercel-react-native-skills` — default for all implementation work in this folder.
- `vercel-composition-patterns` — component API design when needed.
- Web-specific skills (`vercel-react-best-practices` Next.js parts, `web-design-guidelines`) do not apply here.

## 7. Constraints

- The default dev target is the existing iPhone 17 Pro Max Simulator running a GoPlan development build installed via `pnpm exec expo run:ios --device "iPhone 17 Pro Max"`. Do not point users at App Store Expo Go.
- The debug dev build loads its JS bundle from Metro at launch; without a reachable Metro the app shows a connection error. This is expected in development.
- Plain HTTP to `127.0.0.1` is for local Simulator development only; release/TestFlight distribution requires a reachable HTTPS backend.
- Shut down the Simulator after QA to release RAM. Never create/download duplicate runtimes or erase/delete simulator data without owner approval.
