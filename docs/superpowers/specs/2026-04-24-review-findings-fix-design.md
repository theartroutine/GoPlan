# GoPlan — Review Findings Fix Design

**Date:** 2026-04-24
**Source:** `report/review-240426.md` — 40 actionable findings (P0×6, P1×12, P2×10, P3×12)
**Approach:** 3 priority-ordered PRs, each with parallel backend + frontend sub-agents.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| UI Language | English-only | No i18n infrastructure needed now; switch `"Đà Lạt 2026"` → `"Summer Trip 2026"`, audit all Vietnamese strings |
| Pagination | Unify to cursor (trips + friends) | Data integrity — offset pagination risks skip/duplicate on concurrent inserts |
| WS Ticket | Option B — add `/api/ws/refresh-ticket` endpoint | Client self-renews ticket on reconnect; keeps 60s lifetime |

---

## PR 1 — P0 Critical Fixes

**Goal:** Close 6 security/architecture gaps before any new feature work.

### Backend (parallel)

**P0-1 — Service layer exceptions**
- Remove `from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError` from `trips/services.py`
- Add domain exceptions extending `TripServiceError`:
  - `TripNotFoundError(error_code="TRIP_NOT_FOUND")`
  - `NotTripMemberError(error_code="NOT_TRIP_MEMBER")`
  - `TripPermissionError(error_code="PERMISSION_DENIED")`
  - `CannotRemoveSelfError(error_code="CANNOT_REMOVE_SELF")`
  - `CaptainCannotLeaveError(error_code="CAPTAIN_CANNOT_LEAVE")`
- All `raise NotFound/PermissionDenied/ValidationError` in services.py → raise domain exceptions
- `trips/views.py`: catch domain exceptions → return `Response({...}, status=HTTP_*)` explicitly
- Update all tests in `trips/tests/` to expect new exception types

**P0-2 — Throttling for trips views**
- Add `throttle_scope` to all 11 view classes in `trips/views.py`:
  - `TripListCreateAPIView` → `"trips_list_create"`
  - `TripDetailUpdateAPIView` → `"trips_detail_update"`
  - `TripInvitationsAPIView` → `"trips_send_invitations"`
  - `InvitableFriendsAPIView` → `"trips_invitable_friends"`
  - `AcceptInvitationAPIView` → `"trips_accept_invitation"`
  - `DeclineInvitationAPIView` → `"trips_decline_invitation"`
  - `StartTripAPIView` → `"trips_start"`
  - `CompleteTripAPIView` → `"trips_complete"`
  - `CancelTripAPIView` → `"trips_cancel"`
  - `RemoveMemberAPIView` → `"trips_remove_member"`
  - `LeaveTripAPIView` → `"trips_leave"`
- Add rates to `configs/settings.py` DEFAULT_THROTTLE_RATES:
  - `trips_list_create: "60/hour"`
  - `trips_detail_update: "120/hour"`
  - `trips_send_invitations: "10/hour"`
  - `trips_invitable_friends: "60/hour"`
  - `trips_accept_invitation: "30/hour"`
  - `trips_decline_invitation: "30/hour"`
  - `trips_start: "20/hour"`
  - `trips_complete: "20/hour"`
  - `trips_cancel: "20/hour"`
  - `trips_remove_member: "30/hour"`
  - `trips_leave: "30/hour"`
  - `ws_ticket_refresh: "20/minute"`

**P0-3 — User enumeration in invite errors**
- `trips/services.py:send_trip_invitations()`: replace all `f"{invitee.display_name} ..."` with generic messages:
  - `"Cannot invite this user."` + error_code per case: `NOT_FRIEND`, `ALREADY_MEMBER`, `ALREADY_INVITED`
- No display_name in any error or exception message

**P0-4 (backend) — WS refresh-ticket endpoint**
- Add `WsTicketRefreshAPIView(APIView)` in `realtime/views.py` (or new file):
  - `POST /api/ws/refresh-ticket`
  - Auth: `IsAuthenticated + IsProfileCompleted`
  - `throttle_scope = "ws_ticket_refresh"`
  - Returns new ticket using current access token
- Add URL in `realtime/urls.py` (or `api/urls.py`)

### Frontend (parallel)

**P0-5 — Runtime validator for notification payload**
- Create `frontend/features/notifications/domain/payload-parsers.ts`:
  - `parseTripInvitationPayload(raw: unknown): TripInvitationPayload | null`
  - Validates each field: `invitation_id` (string), `trip_name` (string), `destination` (string), `start_date` (string), `end_date` (string)
  - Returns `null` if any field missing/wrong type
- `trip-invitation-notification.tsx`: replace `as unknown as TripInvitationPayload` with parser call; render fallback if `null`

**P0-6 — CSP & security headers**
- `frontend/next.config.ts`: add `async headers()`:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-ancestors 'none';
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
  ```
- Apply to `source: "/:path*"`
- Verify no pages break under CSP (run `npm run build`)

**P0-4 (BFF) — WS refresh-ticket BFF route**
- Create `frontend/app/api/ws/refresh-ticket/route.ts`:
  - POST: attach access token from memory, forward to Django `POST /api/ws/refresh-ticket`
  - Return new ticket to client
- Update WS manager (`ws-manager.ts` or `ws-context.tsx`) to call this BFF endpoint when reconnecting instead of always fetching a new ticket from scratch

### Quality Gates (PR 1)
- Backend: `python manage.py test trips realtime`
- Frontend: `npm run lint && npm run build`

---

## PR 2 — P1 High Priority Fixes

**Goal:** Correctness, data integrity, accessibility. Cursor pagination is the largest change.

### Backend (parallel)

**P1-1 — Race condition friend limit check**
- `friends/services.py:send_friend_request()`: add `select_for_update()` on the query that reads friend count, OR use DB `CHECK CONSTRAINT` with `IntegrityError` handler as authoritative guard

**P1-2 — Accept invitation double-fetch**
- `trips/services.py:accept_invitation()`: replace 3 separate queries (lines 238, 243, 248) with:
  - `TripInvitation.objects.select_related("trip").select_for_update().get(pk=invitation_id)`
  - Use `invitation.trip` directly, no separate `Trip.objects.get()`

**P1-3 + P2-5 — Channel layer failure handling**
- `notifications/services.py`: wrap `_push_ws()` body in its own `try/except` so exception never leaks to request handler
- Change logging to `logger.error(..., exc_info=True)` for better monitoring
- `transaction.on_commit`: ensure `_push_ws()` cannot raise up through the callback

**P1-4 — N+1 serializer precondition**
- `trips/serializers.py:get_member_count`, `get_my_role`: add docstring noting required prefetch
- `trips/views.py:TripListCreateAPIView.get()`: ensure queryset uses `annotate(member_count=Count("memberships"))` so `get_member_count` reads from annotation, not live query

**P1-5 — Partial update date validation**
- `trips/serializers.py:UpdateTripSerializer.validate()`: merge `self.instance` fields with `attrs` before validating `start_date`/`end_date` relationship — catches cases where only one date is in the PATCH payload

**P2-7 (trips) — Cursor pagination**
- `trips/views.py`: replace `LimitOffsetPagination` subclass with cursor pagination ordered by `-created_at`
- Use DRF `CursorPagination` with `ordering = "-created_at"` and `page_size = 20`
- Update `trips/tests/test_trip_list.py` for new pagination shape

**P2-7 (friends) — Cursor pagination**
- `friends/views.py:FriendListAPIView`: replace `FriendListPagination(LimitOffsetPagination)` with cursor pagination ordered by `-created_at` (or friendship join date)
- `FriendListPagination` class at line 68 becomes `CursorPagination` subclass
- Update `friends/tests/` for new pagination shape

### Frontend (parallel)

**P1-6 — Sidebar mobile ARIA + focus trap**
- `sidebar.tsx`: wrap the mobile overlay drawer in a Radix `Dialog.Root` + `Dialog.Content` (shadcn already installed)
- This provides `role="dialog"`, `aria-modal="true"`, focus trap, and return-focus automatically
- Keep existing visual styles; just change the container element

**P1-7 — Form error auto-clear**
- Audit all forms using `fieldErrors`: `register-form.tsx`, `login-form.tsx`, password reset forms, profile setup
- In each `onChange` handler: if the corresponding field has an error, clear it immediately
- Pattern: `onChange={(e) => { setValue(e.target.value); clearFieldError("fieldName"); }}`

**P1-8 — AbortController for trip context**
- `trip-context.tsx:load` callback: create `AbortController`, pass `signal` to `bffGetTrip`
- `useEffect` cleanup: abort the controller from the previous render
- Only set state if `!signal.aborted`

**P1-9 — Accessible invite members checkbox**
- `invite-members-modal.tsx`: replace custom `<button>` used as checkbox with shadcn `<Checkbox>` component
- Ensure `checked` state, `onCheckedChange`, and visible label are all wired correctly

**P1-10 — English-only UI copy**
- `create-trip-form.tsx`: placeholder `"Đà Lạt 2026"` → `"Summer Trip 2026"`
- Audit all files under `frontend/features/` and `frontend/app/` for Vietnamese string literals; replace with English equivalents
- Do not change comments or code identifiers — only user-facing strings

**P1-11 — 429 rate limit UX**
- `frontend/shared/http/bff-client.ts` (or equivalent axios instance): add response interceptor
- Detect `status === 429`, read `Retry-After` header (default 60s), show toast: `"Too many requests. Please try again in Xs."`

**P1-12 — Debounce friend search**
- `friend-search-content.tsx`: add `useDebouncedValue(query, 300)` (or `useEffect` + `setTimeout`) — only trigger search when debounced value changes
- Minimum 2 characters before triggering search
- Cancel in-flight request with `AbortController` when query changes

**P2-7 (frontend) — Cursor pagination UI**
- Update trips list and friends list API clients to send/receive cursor instead of offset/limit
- Update any "load more" or pagination UI components to use `next` cursor from response

### Quality Gates (PR 2)
- Backend: `python manage.py test trips friends`
- Frontend: `npm run lint && npm run build`

---

## PR 3 — P2+P3 Polish & Medium Fixes

**Goal:** Technical debt, accessibility polish, minor correctness.

### Backend (parallel)

**P2-1 — Extract canonical pair logic**
- Create `backend/shared/utils/identity.py` with `canonical_pair(user_a, user_b) -> tuple`
- Refactor `friends/services.py:_are_friends()` and `trips/services.py:_are_friends()` to import from shared util

**P2-2 — Hardcoded numeric status codes**
- `trips/views.py`: replace all raw `status=200`, `status=400`, `status=409` with `status.HTTP_200_OK`, `status.HTTP_400_BAD_REQUEST`, `status.HTTP_409_CONFLICT`

**P2-3 — Inconsistent error_code casing**
- Audit all `error_code` values in `trips/` — ensure all are `SCREAMING_SNAKE_CASE` and specific enough to be actionable (e.g., `INVITE_ERROR` is too generic; split into `NOT_FRIEND`, `ALREADY_MEMBER`, `ALREADY_INVITED` — already done in P0-3)
- Fix any remaining mixed-case codes

**P2-4 — Notification payload schema validation**
- `notifications/services.py:create_notification()`: add TypedDict definitions per `NotificationType` (e.g., `TripInvitationPayload`, `TripCancelledPayload`)
- Before calling `Notification.objects.create(...)`, validate payload dict against the expected TypedDict shape using a simple runtime check (no external library)
- Raise `ValueError` if payload is malformed — this is an internal call so it surfaces immediately during development

**P2-9 — Email verification token single-use**
- `accounts/`: add `EmailVerificationToken` model with fields `token (str)`, `user (FK)`, `created_at`, `used_at (nullable datetime)`
- Migration: create table
- `accounts/services.py`: after successful verify, set `used_at = now()`; on subsequent verify attempt with same token, reject if `used_at` is not null

### Frontend (parallel)

**P2-6 — WS reconnect debounce**
- `ws-context.tsx`: debounce the effect that reacts to `authStatus` by 500ms, so rapid `pending → authenticated` flaps don't cause disconnect/reconnect storms

**P2-8 — Destructive action confirmation dialogs**
- Verify `AlertDialog` exists for: cancel trip, complete trip, leave trip, remove member
- Ensure dialog message includes specific entity name (trip name, member display_name) to prevent misclick

**P2-10 — Non-standard Tailwind duration classes**
- `sidebar.tsx:67`: `duration-260` → `duration-300`
- `sidebar.tsx` desktop transition: `duration-320` → `duration-300`

**P3-4 — Shared BFF error response helper**
- Create `frontend/app/api/_lib/error-response.ts` with `buildErrorResponse(detail, errorCode, status)`
- Refactor BFF route handlers to use it

**P3-5** — `notification-dropdown.tsx`: `text-green-600` → `text-emerald-600`

**P3-6** — `trip-card.tsx`: `border-white/15` → `border-foreground/10`

**P3-7** — `form-field.tsx`: add `role="alert"` + `aria-live="polite"` to error message element

**P3-8** — `date-picker.tsx`: add descriptive `aria-label` to trigger button

**P3-9** — `top-navbar.tsx`: extract hardcoded label strings to constants

**P3-10** — `trip-status-badge.tsx`: export `BadgeVariant` type for strict typing

**P3-11** — `ws-manager.ts`: add `window.addEventListener("beforeunload", () => ws.close())` for graceful disconnect

**P3-12** — Wrap `<Providers>` with an Error Boundary component to catch `useAuth()` throw

**P3-2** — Persist sidebar collapse state in `localStorage`; restore on mount

**P3-3** — `globals.css`: define `:root` and `.dark` CSS variable blocks for dark mode colors; replace scattered `dark:` inline utilities with variable-based approach

### Quality Gates (PR 3)
- Backend: `python manage.py test accounts trips friends`
- Frontend: `npm run lint && npm run build`

---

## Execution Model

Each PR uses parallel sub-agents:
- **Backend sub-agent**: works in `backend/`, runs Django tests before reporting done
- **Frontend sub-agent**: works in `frontend/`, runs `npm run lint && npm run build` before reporting done

Cross-cutting changes (P0-4 WS ticket) are coordinated: backend sub-agent implements Django endpoint first, frontend sub-agent implements BFF route + WS manager update.

## Out of Scope (need separate decisions)
- OpenAPI contract generation (`drf-spectacular`) — tracked as future work
- Sentry / error tracking — tracked as future work
- Soft delete for Trip/TripMember — tracked as future work
- Cursor pagination for notifications — already cursor, no change needed
