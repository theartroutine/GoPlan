# Trip Management Foundation — Design Spec

**Date:** 2026-04-16
**Status:** Approved for implementation planning
**Phase:** 1 of Trip Management

---

## 1. Context

GoPlan is a group trip planning app. This spec covers **Phase 1: Trip Management Foundation** — the structural backbone that all future trip features (finance, chat, timeline) will build on.

The friends system, notification system, and WebSocket infrastructure are already in place. This phase introduces the `trips` Django app and all associated frontend surfaces.

---

## 2. Goals

Deliver a working "trip skeleton" that allows a group to:

- Create a trip
- See trips on the dashboard
- View a trip's overview page
- Invite friends to join
- Accept or decline invitations
- Manage basic membership (Captain can remove, members can leave)
- Edit basic trip info
- Transition trip status (Planning → Ongoing → Completed / Cancelled)

This phase does **not** implement finance, expense tracking, chat, or timeline planning.

---

## 3. Out of Scope (Phase 1)

| Feature | Deferred to |
|---|---|
| Captain transfer / captain leave | Phase: Trip Management v2 |
| Finance, expense items, settlement | Phase: Finance |
| Per-expense currency conversion | Phase: Finance |
| Real-time chat | Phase: Chat |
| Trip timeline / itinerary planning | Phase: Timeline |
| Trip invitations via link (non-friends) | Future |
| Notification for member join (broadcast) | Future |

---

## 4. Data Models

### 4.1 Trip

```python
class TripStatus(TextChoices):
    PLANNING   = "PLANNING"    # Trip is being planned, pre-departure
    ONGOING    = "ONGOING"     # Trip has started (Captain triggered)
    COMPLETED  = "COMPLETED"   # Trip is done (Captain triggered)
    CANCELLED  = "CANCELLED"   # Trip was cancelled (Captain triggered)

class Trip(Model):
    id               = UUIDField(primary_key=True, default=uuid4)
    name             = CharField(max_length=120)
    destination      = CharField(max_length=200)
    start_date       = DateField()
    end_date         = DateField()            # validated: end_date >= start_date
    description      = TextField(blank=True, default="")
    currency_code    = CharField(max_length=3, default="VND")  # required; trip-level setting for Phase finance
    budget_estimate  = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    status           = CharField(max_length=12, choices=TripStatus, default=TripStatus.PLANNING, db_index=True)
    created_by       = ForeignKey(User, on_delete=PROTECT, related_name="created_trips")
    cancelled_at     = DateTimeField(null=True, blank=True)  # audit timestamp
    created_at       = DateTimeField(auto_now_add=True)
    updated_at       = DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            Index(fields=["status"]),
        ]
```

**Notes:**
- `status` is a real DB field, not a computed property. All transitions are manual Captain actions.
- `start_date` is not restricted to future dates — Captains may create trips retroactively.
- `currency_code` is the trip-level currency for all future expense items in Phase finance. Can be changed freely in Phase 1 (no expense items exist). Phase finance will add a warning when changing after expense items are created.
- `budget_estimate` is optional display-only metadata. It does not create any financial obligation or drive any business logic.

### 4.2 TripMember

```python
class TripRole(TextChoices):
    CAPTAIN = "CAPTAIN"
    MEMBER  = "MEMBER"

class MemberStatus(TextChoices):
    ACTIVE  = "ACTIVE"
    LEFT    = "LEFT"     # voluntarily left
    REMOVED = "REMOVED"  # removed by Captain

class TripMember(Model):
    id        = UUIDField(primary_key=True, default=uuid4)
    trip      = ForeignKey(Trip, on_delete=CASCADE, related_name="memberships")
    user      = ForeignKey(User, on_delete=CASCADE, related_name="trip_memberships")
    role      = CharField(max_length=8, choices=TripRole)
    status    = CharField(max_length=8, choices=MemberStatus, default=MemberStatus.ACTIVE)
    joined_at = DateTimeField(auto_now_add=True)
    left_at   = DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["trip", "user"],
                condition=Q(status="ACTIVE"),
                name="tripmember_unique_active_per_trip"
            )
        ]
        indexes = [
            Index(fields=["trip", "status"]),
            Index(fields=["user", "status"]),
        ]
```

**Notes:**
- A user can have multiple membership rows for the same trip (LEFT then re-invited and ACTIVE again). The unique constraint only prevents two ACTIVE rows.
- No membership changes allowed when trip status is COMPLETED or CANCELLED (terminal states).
- Captain cannot leave in Phase 1. Transfer captaincy is a future feature.
- Phase finance settlement works on expense item records, not current membership — a LEFT member still appears in settlement if they participated in any expense.

### 4.3 TripInvitation

```python
class InvitationStatus(TextChoices):
    PENDING   = "PENDING"
    ACCEPTED  = "ACCEPTED"
    DECLINED  = "DECLINED"
    CANCELLED = "CANCELLED"  # auto-cancelled when trip is cancelled

class TripInvitation(Model):
    id           = UUIDField(primary_key=True, default=uuid4)
    trip         = ForeignKey(Trip, on_delete=CASCADE, related_name="invitations")
    inviter      = ForeignKey(User, on_delete=CASCADE, related_name="sent_trip_invitations")
    invitee      = ForeignKey(User, on_delete=CASCADE, related_name="received_trip_invitations")
    status       = CharField(max_length=10, choices=InvitationStatus, default=InvitationStatus.PENDING)
    created_at   = DateTimeField(auto_now_add=True)
    responded_at = DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["trip", "invitee"],
                condition=Q(status="PENDING"),
                name="tripinvitation_unique_pending_per_trip"
            )
        ]
        indexes = [
            Index(fields=["trip", "status"]),
            Index(fields=["invitee", "status"]),
        ]
```

---

## 5. Trip Status Machine

```
[created]
    │
    ▼
PLANNING ──── "Start trip" ────► ONGOING ──── "Complete trip" ────► COMPLETED
    │                               │                                (terminal)
    │ "Cancel trip"                 │ "Cancel trip"
    ▼                               ▼
CANCELLED ◄─────────────────── CANCELLED
(terminal)                      (terminal)

When trip → CANCELLED:
  - All PENDING invitations for that trip are auto-set to CANCELLED
  - Active members' TripMember.status remains ACTIVE (trip stays on their dashboard with Cancelled badge)
```

**Rules:**
- All transitions are triggered manually by Captain only.
- No cronjobs, no auto-compute from dates.
- COMPLETED and CANCELLED are terminal — no membership changes, no invitations, no status transitions possible.
- When trip → CANCELLED: all PENDING invitations for that trip auto-transition to CANCELLED (handled in `cancel_trip()` service).
- When trip → CANCELLED: TripMember rows are NOT changed. Members keep ACTIVE status so the trip remains visible on their dashboard with a Cancelled badge.
- Planning and Ongoing: members can leave, Captain can remove members.

---

## 6. Business Rules

### Roles
- Every trip has exactly one CAPTAIN (the creator).
- All other members have the MEMBER role.
- Captain cannot leave in Phase 1 (no transfer mechanism yet).

### Invitations
- Only Captain can send invitations.
- Can only invite users in Captain's friends list.
- Cannot invite self.
- Cannot invite existing ACTIVE members.
- Cannot invite someone with an existing PENDING invitation for the same trip.
- Re-inviting a LEFT or REMOVED member is allowed (creates a new TripInvitation row).
- Invitations are trip-scoped — accepting means joining that specific trip.

### Membership changes
- Leave and Remove are allowed in PLANNING and ONGOING states.
- Leave and Remove are forbidden in COMPLETED and CANCELLED states (terminal).
- Hard delete is never used — statuses are updated to LEFT or REMOVED, `left_at` is recorded.

### Dates
- `end_date >= start_date` is enforced. No other date constraints.
- `start_date` may be in the past (Captain may create trip retroactively).
- Trip dates are plan dates only — they do not trigger status transitions.

### Budget
- `budget_estimate` is optional. No business logic depends on it.
- If present, displayed as: "12,000,000 VND" total, "~4,000,000 VND/người" (total ÷ ACTIVE member count).
- `currency_code` is required, defaults to VND, applies trip-wide.

---

## 7. API Contract

All endpoints require `IsAuthenticated` + `IsProfileCompleted`. No trailing slashes.

```
# Trip CRUD
POST   /trips                              Create trip → 201
GET    /trips                              List user's trips (ACTIVE TripMember rows, all statuses incl. CANCELLED) → 200
GET    /trips/{id}                         Trip detail + members → 200
PATCH  /trips/{id}                         Edit trip info (Captain only) → 200

# Status transitions — Captain only
POST   /trips/{id}/start                   Planning → Ongoing → 200
POST   /trips/{id}/complete                Ongoing → Completed → 200
POST   /trips/{id}/cancel                  Planning/Ongoing → Cancelled → 200

# Membership
POST   /trips/{id}/leave                   Member leaves (non-terminal status) → 200
DELETE /trips/{id}/members/{user_id}       Captain removes member (non-terminal) → 204

# Invitations — trip-scoped (Captain)
POST   /trips/{id}/invitations             Invite friends; body: { invitee_ids: [uuid] } → 201
GET    /trips/{id}/invitations             List PENDING invitations (Captain only) → 200
GET    /trips/{id}/invitable-friends       Friends who can be invited (not ACTIVE, not PENDING) → 200

# Invitations — user-scoped (invitee responds)
POST   /invitations/{inv_id}/accept        Accept invitation → 200
POST   /invitations/{inv_id}/decline       Decline invitation → 200
```

### Key response shapes

**GET /trips — list (dashboard card):**
```json
{
  "count": 3,
  "results": [{
    "id": "uuid",
    "name": "Đà Lạt 2026",
    "destination": "Đà Lạt",
    "start_date": "2026-05-01",
    "end_date": "2026-05-05",
    "status": "PLANNING",
    "member_count": 4,
    "currency_code": "VND",
    "budget_estimate": "12000000.00",
    "my_role": "CAPTAIN"
  }]
}
```

**GET /trips/{id} — detail (overview page):**
```json
{
  "trip": {
    "id": "uuid", "name": "...", "destination": "...",
    "start_date": "...", "end_date": "...", "description": "...",
    "status": "PLANNING", "currency_code": "VND",
    "budget_estimate": "12000000.00",
    "cancelled_at": null, "created_at": "..."
  },
  "my_membership": { "role": "CAPTAIN", "status": "ACTIVE", "joined_at": "..." },
  "members": [{
    "membership_id": "uuid",
    "user": { "id": "uuid", "display_name": "...", "identify_tag": "..." },
    "role": "CAPTAIN",
    "joined_at": "..."
  }]
}
```

### Error format (consistent with existing codebase)
```json
{ "detail": "Human-readable message.", "error_code": "MACHINE_CODE" }
```

### Key error codes
`TRIP_NOT_FOUND`, `NOT_TRIP_MEMBER`, `NOT_CAPTAIN`, `INVALID_STATUS_TRANSITION`,
`TRIP_TERMINAL`, `ALREADY_MEMBER`, `INVITATION_NOT_FOUND`, `INVITEE_ALREADY_PENDING`,
`NOT_FRIENDS`, `SELF_INVITE`, `INVITATION_NOT_PENDING`

---

## 8. Notification Extension

### New NotificationType values

```python
TRIP_INVITATION          = "TRIP_INVITATION"           # Captain invites you
TRIP_INVITATION_ACCEPTED = "TRIP_INVITATION_ACCEPTED"  # Invitee accepted → Captain notified
TRIP_INVITATION_DECLINED = "TRIP_INVITATION_DECLINED"  # Invitee declined → Captain notified
TRIP_CANCELLED           = "TRIP_CANCELLED"            # Trip cancelled → all active members notified
TRIP_MEMBER_REMOVED      = "TRIP_MEMBER_REMOVED"       # Captain removed you → you notified
```

### Notification payloads

| Type | Payload |
|---|---|
| `TRIP_INVITATION` | `trip_id`, `trip_name`, `destination`, `start_date`, `end_date`, `invitation_id` |
| `TRIP_INVITATION_ACCEPTED` | `trip_id`, `trip_name`, `accepted_by_name` |
| `TRIP_INVITATION_DECLINED` | `trip_id`, `trip_name`, `declined_by_name` |
| `TRIP_CANCELLED` | `trip_id`, `trip_name` |
| `TRIP_MEMBER_REMOVED` | `trip_id`, `trip_name` |

### Notification UI

`TRIP_INVITATION` uses a **compact rich card** (Option A):
- Shows: inviter name, trip name, destination, date range
- Inline Accept and Decline buttons — no navigation required
- "tap to view trip" affordance for users who want more context before deciding
- Other notification types use the existing simple card format

No model migration needed — `Notification.payload` is already a JSONField, and `type` is a `CharField`.

---

## 9. Frontend Architecture

### Feature folder

```
features/trips/
  domain/
    types.ts                   # Trip, TripMember, TripInvitation, enums
  infrastructure/
    trips-api.ts               # All BFF calls
  presentation/
    trip-card.tsx              # Dashboard card
    trip-status-badge.tsx      # Reusable status badge
    trip-overview-content.tsx  # Overview page content
    create-trip-form.tsx       # Create trip form
    invite-members-modal.tsx   # Friend picker for invitations
    trip-invitation-card.tsx   # Rich notification card with Accept/Decline
```

### Pages

```
app/(shell)/
  page.tsx                     # Dashboard — trip list (currently a placeholder, replaced in Issue 2)
  trips/
    create/page.tsx            # Create trip
    [tripId]/page.tsx          # Trip overview
```

### BFF routes

```
app/api/
  trips/
    route.ts                          # GET /trips, POST /trips
    [tripId]/
      route.ts                        # GET /trips/{id}, PATCH /trips/{id}
      start/route.ts
      complete/route.ts
      cancel/route.ts
      leave/route.ts
      members/[userId]/route.ts
      invitations/
        route.ts                      # GET + POST
        invitable-friends/route.ts
  invitations/
    [invId]/
      accept/route.ts
      decline/route.ts
```

---

## 10. Issue Breakdown

Approach C: foundation layer first, then vertical feature slices.

| # | Issue | Depends on | Deliverable |
|---|---|---|---|
| 1 | Trip foundation: models & migrations | — | DB schema only, no API |
| 2 | Create Trip + Dashboard | 1 | User can create trip, see dashboard list |
| 3 | Trip Overview + Edit trip | 2 | User can view overview, Captain can edit |
| 4 | Notification system extension | 3 | Rich TRIP_INVITATION card, 5 new notification types |
| 5 | Invite members + Realtime push | 4 | Captain can invite friends, invitee gets realtime notification |
| 6 | Accept / Decline invitation | 5 | Full invitation flow works end-to-end |
| 7 | Captain actions (status + remove + cancel) | 3 | Captain can start/complete/cancel trip, remove members |
| 8 | Member leave trip | 3 | Member can leave trip |

**Parallelism after Issue 3:** Issues 4→5→6 (invitation flow) and Issues 7, 8 can be worked in parallel.

### Issue summaries

**Issue 1 — Trip foundation: models & migrations**
Creates the `trips` Django app with Trip, TripMember, TripInvitation models and migrations. No API, no UI. Goal: get the schema reviewed and merged cleanly before any feature is built on top.

**Issue 2 — Create Trip + Dashboard**
Implements the full Create Trip flow (backend API + BFF + form) and the Dashboard page (trip card list, empty state). After this issue: a user can create their first trip and see it on their homepage.

**Issue 3 — Trip Overview + Edit trip**
Implements the Trip Overview page (shows trip info, member list, pending invitations, Captain action area) and the Edit trip form. After this issue: clicking a trip card leads to a meaningful overview page.

**Issue 4 — Notification system extension**
Adds 5 new `NotificationType` values and redesigns the notification panel to support rich cards with inline actions. Introduces the `TripInvitationCard` component (Accept/Decline buttons, trip summary). No invitation logic yet — this issue only extends the notification infrastructure. Must be merged before Issue 5.

**Issue 5 — Invite members + Realtime push**
Implements the invite flow: Captain opens the Invite modal, selects friends from the invitable list, submits. Backend sends `TRIP_INVITATION` notifications via WebSocket to all invitees. Pending invitations appear in Trip Overview. Depends on Issue 4 for the notification card component.

**Issue 6 — Accept / Decline invitation**
Implements the accept and decline endpoints and wires them to the notification card buttons. Accepting adds the user as an ACTIVE member and makes the trip appear on their dashboard. Captain receives a `TRIP_INVITATION_ACCEPTED` or `TRIP_INVITATION_DECLINED` realtime notification. After this issue: the full invitation lifecycle works end-to-end.

**Issue 7 — Captain actions: status transitions + remove member + cancel trip**
Implements the three Captain-only powers: (1) change trip status (Planning→Ongoing, Ongoing→Completed), (2) remove a member, (3) cancel the trip. All actions are guarded by `is_captain` permission. Cancelling auto-cancels PENDING invitations and pushes `TRIP_CANCELLED` to all active members. Removing pushes `TRIP_MEMBER_REMOVED` to the removed user.

**Issue 8 — Member leave trip**
Implements the leave endpoint (`POST /trips/{id}/leave`). Member can leave a trip in PLANNING or ONGOING status. Captain cannot leave. Updates membership row to LEFT, records `left_at`. Trip disappears from the leaving member's dashboard.

---

## 11. Key Decisions

| Decision | Rationale |
|---|---|
| `status` is a real DB field, not computed from dates | Actual trip start/end doesn't always match planned dates; Captain has authoritative knowledge |
| `start_date` not restricted to future | Captains may create a trip retroactively (group started using GoPlan mid-trip) |
| Leave/Remove allowed in PLANNING and ONGOING | Phase finance uses per-expense model (no pool), so leaving doesn't break historical expense records |
| Leave/Remove forbidden in terminal states | Trip is over; no meaningful membership change possible |
| Captain cannot leave in Phase 1 | Transfer captaincy is a separate feature; deferred to avoid incomplete UX |
| `currency_code` required, free to change in Phase 1 | Trip-level currency setting for Phase finance; no expense items exist yet to create inconsistency |
| `budget_estimate` optional, display-only | No financial obligation; gives rough planning context before finance system exists |
| Re-invite after LEFT/REMOVED is allowed | New invitation row; unique constraint only prevents duplicate PENDING |
| Auto-cancel PENDING invitations on trip cancel | Prevents orphaned invitations that can never be acted on |
| Notification UI Option A (compact rich card) | Fits existing panel width; sufficient context for accept/decline decision |
| Invitation only from friends list | Phase 1 scope; link-based invites deferred |
