# GoPlan Mobile

GoPlan's mobile app — Expo (React Native) client for the GoPlan group trip planner. It talks directly to the Django backend (no BFF) and follows a native-first design language independent from the web app.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure the backend URL

   ```bash
   cp .env.example .env
   # Set EXPO_PUBLIC_API_URL to your Mac's LAN IP, e.g. http://192.168.1.23:8000
   # Find it with: ipconfig getifaddr en0
   ```

   The backend must be running (Podman Compose, repo root) and the phone must be on the same Wi-Fi network.

3. Start the dev server

   ```bash
   npx expo start
   ```

   Scan the QR code with the iPhone camera to open the app in [Expo Go](https://expo.dev/go).

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
```

## Conventions

See `CLAUDE.md` / `AGENTS.md` in this folder for the full operating manual (stack, layout, auth rules, design tokens).
