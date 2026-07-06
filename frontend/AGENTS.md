# GoPlan Frontend — Codex Instructions

## 1. Scope

This file applies to `frontend/` and overrides root `AGENTS.md` for frontend-specific behavior.

## 2. Stack

- Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui
- HTTP: Axios → BFF (Next.js Route Handlers → Django)
- WebSocket transport is governed by the root architecture decision; do not infer it from the HTTP rule alone
- This is a web frontend — no React Native or Expo assumptions.

## 3. Commands

```bash
# Run from frontend/
npm run dev
npm run lint
npm run build
```

## 4. Code Conventions

- TypeScript strict mode — no `any`, no unsafe assertions.
- Named exports by default (except Next.js page/layout conventions).
- PascalCase: components, types, interfaces.
- camelCase: functions, hooks, variables.
- Absolute imports with `@/` where configured.
- Business logic must not live in presentation components.
- Mobile-first: base styles target mobile (375px+), use `sm:`, `md:`, `lg:` breakpoints for larger screens. All new components must be usable on mobile.

## 5. Skill Usage

Available skills in `.agents/skills/` (project root):

### vercel-react-best-practices (default)
- **When**: any React/Next.js implementation, review, or refactor work — components, server/client boundaries, route handlers, data fetching, hydration, rendering performance, bundle optimization.

### vercel-composition-patterns (add when needed)
- **When**: component API design, refactoring boolean-prop-heavy components, compound components, context/provider structure, reusable UI primitives.

### web-design-guidelines (on request)
- **When**: explicit UI/UX/accessibility/design review tasks — not a mandatory step for every implementation.

### vercel-react-native-skills (do not use here)
- Belongs to `mobile/` (React Native app). Not applicable to this web frontend.

### Skill Rules
- Use the minimal set of skills that fit the task.
- Start with `vercel-react-best-practices` for implementation work.
- Add others only when their specific domain is part of the task.
- Skills guide new code — they do not force refactoring of working code.
