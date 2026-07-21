# GoPlan Mobile

GoPlan's mobile app — Expo (React Native) client for the GoPlan group trip planner. It talks directly to the Django backend (no BFF) and follows a native-first design language independent from the web app.

## Get started

1. Install dependencies

   ```bash
   pnpm install
   ```

2. Configure the backend URL

   ```bash
   cp .env.example .env
   # Set EXPO_PUBLIC_API_URL to your Mac's LAN IP, e.g. http://192.168.1.23:8000
   # Find it with: ipconfig getifaddr en0
   ```

   The backend must be running (Podman Compose, repo root) and the phone must be on the same Wi-Fi network.

3. Install the dev build on the iPhone (first time only)

   ```bash
   pnpm exec expo run:ios --device
   ```

   Requires Xcode and a USB cable. App Store Expo Go is capped at SDK 54 and cannot run this project. Rebuild with the same command when a native dependency is added, `app.json` changes, the free-account signature expires (7 days), or the Wi-Fi network changes (the Metro URL is baked into the build).

4. Start the dev server (daily workflow, no cable)

   ```bash
   pnpm exec expo start
   ```

   Open the installed GoPlan app on the iPhone — it connects to Metro automatically and hot-reloads code changes.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Conventions

See `CLAUDE.md` / `AGENTS.md` in this folder for the full operating manual (stack, layout, auth rules, design tokens).
