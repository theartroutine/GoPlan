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

## 3. Commands

```bash
# Run from mobile/
pnpm exec expo start               # Metro dev server; then open the installed GoPlan dev build on the iPhone (same Wi-Fi, no cable)
pnpm exec expo run:ios --device    # build + install the dev build via Xcode (cable required)
pnpm lint
pnpm typecheck
pnpm test
```

Dev setup: copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_URL` to the Mac's LAN IP
(`ipconfig getifaddr en0`); Mac and phone must share the same Wi-Fi network.

Rebuild (`pnpm exec expo run:ios --device`) is only needed when: a dependency with native code is
added, `app.json` changes, the free-account signature expires (7 days), or the Wi-Fi
network/IP changes (the Metro URL is baked into the build). Pure-JS dependencies and all
TS/TSX changes need no rebuild — Metro hot-reloads them.

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
Auth or navigation-gate changes additionally require a manual run on the iPhone (login → tabs → relaunch → logout).

## 6. Skill Usage

- `vercel-react-native-skills` — default for all implementation work in this folder.
- `vercel-composition-patterns` — component API design when needed.
- Web-specific skills (`vercel-react-best-practices` Next.js parts, `web-design-guidelines`) do not apply here.

## 7. Constraints

- The dev target is a development build installed via `pnpm exec expo run:ios --device`. App Store Expo Go is capped at SDK 54 and cannot run this project — do not point users at Expo Go.
- The debug dev build loads its JS bundle from Metro at launch; without a reachable Metro the app shows a connection error. This is expected in development.
- iOS ATS allows the plain-HTTP LAN setup in debug builds only; release/TestFlight distribution requires HTTPS — treat that as a release-time task, not a dev concern.
