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
   # Default Simulator value:
   # EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
   ```

   The backend must be running on Mac port `8000` (normally through Podman Compose from the repository root). The iOS Simulator can reach it through `127.0.0.1`.

3. Verify and boot the existing iPhone 17 Pro Max Simulator

   ```bash
   xcrun simctl list runtimes
   xcrun simctl list devices available
   xcrun simctl boot "iPhone 17 Pro Max" # only when its state is Shutdown
   open -a Simulator
   xcrun simctl bootstatus "iPhone 17 Pro Max" -b
   ```

   Reuse the installed device/runtime. Do not create a duplicate Simulator, download another runtime, or erase/delete Simulator data without approval.

4. Build and install the development client (first time or after native changes)

   ```bash
   pnpm exec expo run:ios --device "iPhone 17 Pro Max" --configuration Debug
   ```

   Use the installed GoPlan development build, not App Store Expo Go. Rebuild when native dependencies, `app.json`/config plugins, entitlements, or files under `ios/` change.

5. Start the dev server (daily workflow; no native rebuild)

   ```bash
   pnpm exec expo start --dev-client --localhost
   xcrun simctl launch "iPhone 17 Pro Max" com.anonymous.goplan
   ```

   Metro hot-reloads JS/TS, styles, and ordinary app changes. `EXPO_PUBLIC_` changes need a full reload, not a native rebuild; use `--clear` only if Metro retains a stale value.

6. Shut down the Simulator after testing to release RAM without deleting app data

   ```bash
   xcrun simctl shutdown "iPhone 17 Pro Max"
   ```

For the complete simulator workflow and the authorized `@Computer` fallback when no suitable E2E/simulator-control tool is available, see `AGENTS.md` / `CLAUDE.md` in this folder.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Conventions

See `CLAUDE.md` / `AGENTS.md` in this folder for the full operating manual (stack, layout, auth rules, design tokens).
