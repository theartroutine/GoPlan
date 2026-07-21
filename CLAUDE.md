# GoPlan — Claude Code Operating Manual

## 1. Authority

- This is the root instruction file. Layer-specific details live in `frontend/CLAUDE.md`, `backend/CLAUDE.md`, and `mobile/CLAUDE.md`.
- When working inside `frontend/`, `backend/`, or `mobile/`, apply the scoped CLAUDE.md first; this file governs cross-layer rules and defaults.
- Keep runtime truth, architecture invariants, and security rules aligned with `AGENTS.md`. Do not let only one manual introduce a feature-specific exception.

## 2. Project Context

GoPlan is a web application for group trip planning — managing itineraries, expenses, tasks, and real-time communication for friend groups, families, and teams. It is a personal project built to enterprise-grade standards.

## 3. Runtime Truth

| Layer | Stack |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| HTTP Integration | Axios, BFF flow (`browser → Next.js Route Handlers → Django`) |
| Realtime Transport | WebSocket over ASGI; topology/auth transport must be documented per feature |
| Backend | Django 5.2, DRF, SimpleJWT, PostgreSQL 16 |
| Container | Podman Compose |
| Mobile | Expo SDK 57 (React Native), TypeScript 5, Expo Router; Axios direct to Django (no BFF) |

Execution context:
- Frontend commands: run in `frontend/`
- Backend commands: run in `backend/`
- Container commands: run in repository root
- Mobile commands: run in `mobile/`

## 4. Working Style

### Communication
- Chat with the owner in Vietnamese.
- Code, comments, commit messages, and technical artifacts in English.
- When using technical terms the owner may not know, explain what it is and why it matters in the same sentence.
- Report at moderate level: what changed, what was not done, risks. Keep it clear and understandable.

### Decision Making
- For substantial features: understand the requirement → read existing code → plan → get owner confirmation → implement.
- For small fixes (UI bugs, typos): implement directly.
- When unsure: present options with honest assessment of pros/cons, state which one is recommended and why. Let the owner decide.
- When confident: choose the best approach, explain the reasoning.
- For architecture decisions not yet needed: document the options but do not force premature choices.

### Issue as Single Source of Truth
- GitHub Issues are the single source of truth for scope. Anyone joining the project reads the issue top-to-bottom.
- During planning: if the plan deviates from the issue (different model fields, different architecture, renamed components), edit the issue body **before** implementing. Use strikethrough (`~~old~~`) for changed parts and add the new decision inline — never delete original text.
- Implementation details and summaries belong in the PR, not in issue comments.
- Rule: plan diverges from issue → update issue first → then implement.

### Git Workflow
- Commit to `main` when the owner requests.
- Recommend creating feature branches for complex features — explain why when suggesting.
- The owner is learning git — guide clearly when git operations are needed.
- Never add `Co-Authored-By` trailers to commit messages.
- Keep `docs/` local-only; do not commit or push files from that folder to the remote repository.

### Branch & Release Model
- `main` is the source of truth for application code. All feature and bugfix work branches from `main` and merges back via PR (issue → branch → PR → merge).
- `production` is the long-lived deploy branch: always equal to `main` plus production deploy config only (`podman-compose.prod.yml`, `frontend/Containerfile`, `deploy/RUNBOOK.md`, ignore files, env templates, env-driven source config). Never merge `production` into `main`, and never develop features on it.
- Release flow after merging app changes into `main`: `git checkout production && git merge main && git push`, then return to `main`. The homelab pulls `production` and runs `docker compose -f podman-compose.prod.yml up -d --build`. Merge conflicts are resolved on the dev machine, never on the homelab.
- Any new or changed environment variable must update the matching `.env.example` in the same PR. Real env files live only on each machine and are never committed.
- If the `production` diff vs `main` ever grows beyond deploy config, split the app changes back to `main` first.

## 5. Architecture Invariants (P0)

- Browser HTTP/API calls must not call Django directly — they go through BFF (Next.js Route Handlers).
- Refresh token: HttpOnly cookie only. Access token: in-memory only. Never localStorage/sessionStorage.
- Backend-BFF-frontend contracts must stay aligned — do not finalize work when they are misaligned.
- Backend layer separation: views (thin) → serializers (validation) → services (logic) → models (persistence).
- Mobile-first responsive design — all UI must work on 375px+ viewport widths. Use Tailwind mobile-first breakpoints (base → sm → md → lg).
- WebSocket transport is a separate architecture decision. Do not treat direct browser → Django or proxy-through-Next as an invariant by default; record the chosen topology and auth transport in the issue before implementation.
- Do not hardcode bearer tokens in URLs as a blessed pattern. If a browser WebSocket temporarily uses query-string auth because of platform constraints, document the logging/leakage risk and treat it as an explicit trade-off, not a reusable default.
- Mobile app (React Native) calls Django directly — the BFF rule covers browsers only. Mobile refresh token: SecureStore/Keychain only. Mobile access token: in-memory only. Never AsyncStorage for tokens.

## 6. Security Baseline (P0)

- Passwords always via `set_password()`.
- Scoped throttling on all sensitive endpoints.
- No user enumeration in error messages.
- Never expose secrets, tokens, or sensitive logs.
- Never commit real environment values.

## 7. Quality Gates

| Change Type | Required | Recommended |
|---|---|---|
| Frontend-only | `pnpm lint` | `pnpm build` for route/state changes |
| Backend-only | `python manage.py test <app>` | Migration flow when schema changes |
| Cross-layer | Backend tests + `pnpm lint` | `pnpm build` when frontend impacted |
| Mobile-only | `pnpm lint` + `pnpm typecheck` + `pnpm test` | Manual device run for auth/navigation changes |

When checks cannot run, report: command attempted, failure reason, risk level, manual verification path.

## 8. Execution Playbooks

### New API Endpoint
1. Trace route ownership (`configs → api → app`).
2. Define request/response/error/auth contract.
3. Implement backend layers at correct boundaries.
4. Implement BFF route and frontend integration.
5. Run tests, report contract decisions and risks.

### Backend Business Bugfix
1. Reproduce and isolate the failing path.
2. Fix at the correct layer (serializer/service/manager/model).
3. Add regression test.
4. Report before/after behavior.

### Auth/Security Change
1. Map token/session/throttle/error-surface impact.
2. Verify no secret leakage or enumeration regression.
3. Update backend and BFF/frontend consistently.
4. Report security impact.

### DB Schema Change
1. Evaluate backward compatibility.
2. Generate and review migrations.
3. Apply migration, run tests.
4. Report migration risk and rollback options.

## 9. Definition of Done

Substantial work is done when:
- Business outcome is implemented,
- Backend-BFF-frontend contracts are aligned,
- Security baseline is preserved,
- Relevant tests passed or gaps are documented with risk level.

Delivery report format:
1. **What changed** — brief summary
2. **What not done / not verified** — if any
3. **Risks** — if any

## 10. Anti-Patterns

Do not:
- Skip contract alignment for behavior changes.
- Put heavy business logic in UI components or Django views.
- Use type escapes (`any`, `# type: ignore`) without justification.
- Skip tests for logic changes without risk disclosure.
- Ship silent behavior changes.
- Force destructive migration fixes without approval.

## 11. Maintenance

- P0: non-negotiable rules (architecture, security).
- P1: strong defaults (quality gates, conventions).
- P2: recommended guidance (style preferences).
- New rules replace older duplicates — do not stack.
