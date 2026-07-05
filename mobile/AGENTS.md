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
npx expo start        # dev server; scan QR with the iPhone (Expo Go)
npm run lint
npm run typecheck
npm test
```

Dev setup: copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_URL` to the Mac's LAN IP
(`ipconfig getifaddr en0`); Mac and phone must share the same Wi-Fi network.

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

Every change: `npm run lint` + `npm run typecheck` + `npm test`.
Auth or navigation-gate changes additionally require a manual run on the iPhone (login → tabs → relaunch → logout).

## 6. Skill Usage

- `vercel-react-native-skills` — default for all implementation work in this folder.
- `vercel-composition-patterns` — component API design when needed.
- Web-specific skills (`vercel-react-best-practices` Next.js parts, `web-design-guidelines`) do not apply here.

## 7. Constraints

- Expo Go is the current dev target; features requiring native modules outside the Expo SDK (e.g. push notifications) need a dev build — treat that as an architecture decision, not a default.
- iOS ATS blocks plain HTTP in standalone/dev builds; the LAN HTTP setup works inside Expo Go only.
