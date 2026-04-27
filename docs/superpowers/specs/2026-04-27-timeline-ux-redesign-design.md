# Timeline UX Redesign Design

Last updated: 2026-04-27

## Objective

Redesign the trip Timeline experience so it feels like a clear travel flow instead of a dense inline editing workspace. The timeline should help first-time users understand where they are in the trip, what is happening now, what happened before, and what comes next.

The implementation should preserve the existing Timeline feature scope where possible, but the UI and product model must become easier to understand before adding more features.

## Current Problems

- Add/edit activity currently happens inline inside the timeline, making the page cramped and hard to scan.
- Add/edit day and Manage Types also render inline, which competes with the timeline content.
- The location form exposes implementation language such as `Location Mode` instead of a user-facing location picker.
- HERE autocomplete exists elsewhere in the app but is not presented consistently in Timeline.
- Special Day currently uses a plain date input instead of the existing shared calendar/date picker UI.
- A long trip timeline can become too long to scroll through comfortably.
- Activity status exists, but showing all controls directly on cards makes the timeline feel like a task manager.

## Design Principles

- Timeline is primarily a viewing and orientation surface.
- Creation and editing happen in focused modal surfaces.
- The UI should hide technical model names from the user when a simpler interaction can express the same choice.
- The user should always know the current trip position: past day, focused/current day, upcoming day, and now within the current day when possible.
- The design should support many activities per day without requiring blind scrolling.
- Backend-BFF-frontend contracts must stay aligned.

## Product Model

### Day

A Day is the main timeline container.

- System days are generated from the trip start/end date.
- Special days are manually added around or within the trip.
- Each Day can be past, focused/current, or upcoming based on `trip_timezone` and `section_date`.
- Each Day can be expanded or collapsed in the UI.

### Activity Schedule Modes

Timeline activities should support four schedule modes:

- `AT_TIME`: activity starts at one specific time.
- `TIME_RANGE`: activity has a start and end time.
- `ALL_DAY`: activity applies to the whole day.
- `FLEXIBLE`: activity belongs to the day but has no fixed time.

`FLEXIBLE` is a new product model and backend contract value. It must not be overloaded into `ALL_DAY`, because `ALL_DAY` means the activity applies throughout the day while `FLEXIBLE` means it can happen at any time.

### Activity Status

Keep the existing manual status model:

- `UPCOMING`
- `IN_PROGRESS`
- `DONE`
- `CANCELLED`

Status is manually managed by users who have status-update capability. It must not be automatically derived from current time.

Permission rules must preserve the current backend contract:

- Captains can use the full status state machine allowed by the backend.
- Assigned non-captain members can use the limited assignee workflow: `UPCOMING` -> `IN_PROGRESS`, and `IN_PROGRESS` -> `UPCOMING` or `DONE`.
- Assigned non-captain members cannot cancel activities, restore cancelled activities, or reopen done activities.
- Unassigned non-captain members cannot update activity status.
- Frontend status menus must use the API-provided activity capabilities instead of inferring capability only from trip role.

Time position and status are separate:

- Time position drives the timeline flow: past, today, now, upcoming.
- Status drives operational state: in progress, done, cancelled.

## Timeline Layout

Use a Focused Day Timeline.

- Keep a vertical timeline rail so the screen still feels like a chronological flow.
- Day nodes remain visible on the rail.
- The focused Day is expanded by default.
- Other Days are collapsed into summary rows but still remain on the rail.
- Users can open additional Days for comparison.
- The focused Day cannot be closed while it is the automatic/default focus.

Default focus rules:

- First compute local today from `trip_timezone`.
- If one or more sections have `section_date` equal to local today, focus the system Day for that date when it exists; otherwise focus the first same-date special section by timeline order.
- If no section matches local today and local today is before trip start, focus Day 01.
- If no section matches local today and local today is after trip end, focus the last system day.
- If the user explicitly opens/focuses another Day, persist that section in the URL query so reload returns to the same context.

URL state must identify `TimelineSection.id`, not only a date. Multiple sections can share the same `section_date` because a system day and one or more special day sections can be siblings on the same date.

Suggested query state:

- `section=<section_id>` for the focused section.
- Optional `openSections=<section_id>,<section_id>` if multiple open sections need to persist.
- Date values may be used for display and default focus derivation, but not as the persisted section identity.

## Day Content

An expanded Day groups activities into:

- `All-day`: `ALL_DAY`
- `Timeline`: `AT_TIME` and `TIME_RANGE`
- `Flexible`: `FLEXIBLE`

The Timeline group is ordered by time. Existing position is only a tie-breaker for scheduled activities with the same time. All-day and Flexible groups use the existing position order.

Reorder policy:

- Do not show generic up/down reorder controls for the time-ordered Timeline group, because changing position cannot move a scheduled activity before an earlier time.
- Captains reorder scheduled activities by editing their start/end times.
- All-day and Flexible groups may keep compact reorder controls because those groups are position-ordered.
- If grouped reorder uses the current backend full-section reorder endpoint, the frontend must submit the complete section activity ID list while only changing the relative order inside the target group and preserving all other activity IDs.
- If that scoped reorder behavior is not implemented in the first pass, hide reorder controls in grouped Timeline UI and keep reorder out of scope for this redesign.

Each group initially shows 5 activities. If there are more, show `Show N more` for that group only. Expanding one group should not expand other groups.

Collapsed Day summaries should show enough context to avoid blind opening:

- Day label and date.
- Past/today/upcoming indicator.
- Activity counts by group.
- Next scheduled activity title/time when available.

## Now Marker

Show the `Now` marker only when:

- Today falls within the trip or special section date being displayed.
- The Day is the focused/current Day.
- `trip_timezone` is available.
- There is at least one scheduled activity in the Timeline group.

Rules:

- For `AT_TIME`, use `start_time`.
- For `TIME_RANGE`, use `start_time` and `end_time`; if current time is inside the range, style the activity as currently active.
- `ALL_DAY` and `FLEXIBLE` do not determine the Now marker position.
- If no scheduled activities exist in the focused Day, show the Day as current but do not force an artificial Now marker into all-day/flexible groups.

Marker placement must be deterministic:

- Before the first scheduled item when current local time is earlier than the first scheduled `start_time`.
- Immediately before an `AT_TIME` activity when current local time equals its `start_time`.
- Between two scheduled items when current local time is after the previous item's effective end and before the next item's `start_time`.
- Inside a `TIME_RANGE` activity when current local time is greater than or equal to `start_time` and earlier than `end_time`; style that card as currently active.
- After the last scheduled item when current local time is later than the last scheduled item's effective end.
- With only one scheduled activity, apply the same before/inside/after rules.

Effective end:

- `AT_TIME` uses its `start_time` as an instant.
- `TIME_RANGE` uses `end_time`.

## Activity Card UI

Activity cards should be compact and scan-friendly.

Primary card content:

- Time or schedule label.
- Title.
- Type.
- Location summary.
- Assignee when present.
- Status pill only when useful.

Status UI:

- `UPCOMING`: default, no strong badge.
- `IN_PROGRESS`: most visually prominent status, especially in the focused Day.
- `DONE`: card is muted and shows a check indicator.
- `CANCELLED`: card is muted, title may be struck through, and it remains in the timeline.

Status changes use a Status Pill Menu:

- A small pill/menu on the activity card opens status actions.
- Do not render all status buttons directly on every card.
- Only users with status update capability can change status.

## Modal Surfaces

Inline forms should be removed from the timeline surface.

Use modals for:

- Add Activity
- Edit Activity
- Add Special Day
- Edit Day
- Manage Types

Modal behavior:

- Background overlay dims the app.
- Pristine modals can close via cancel, Escape, and outside click.
- Dirty Add/Edit Activity and Add/Edit Day modals must not silently close from outside click or Escape; show an unsaved-changes confirmation before discarding input.
- Manage Types must guard dirty create/edit inputs before closing, but completed row actions do not need a dirty-state guard.
- While a submit/delete/status action is in flight, disable close controls that would interrupt the request.
- Form submission shows loading state.
- Successful create/update/delete actions use toast feedback.
- Errors appear inline in the modal and may also use a destructive toast when appropriate.

## Add/Edit Activity Modal

Use the "Essentials + More Details" layout.

Core fields visible immediately:

- Title
- Schedule type: `At time`, `Time range`, `All-day`, `Flexible`
- Start/end time inputs when required by schedule type
- Type
- Location
- Assignee

More Details section:

- Note
- Meeting point
- Booking reference
- Contact name
- Contact phone
- External link
- Reminders

Reminder rules:

- Reminders are only available for `AT_TIME` and `TIME_RANGE`.
- `ALL_DAY` and `FLEXIBLE` do not support reminders in this design.
- When switching an activity to `ALL_DAY` or `FLEXIBLE`, the frontend must clear disabled reminder selections and send `reminder_offsets_minutes: []`.
- Backend must delete unsent reminder rows when an activity moves to a no-reminder mode or loses `start_time`.
- Sent reminder history can remain in the database for audit/history, but serialized `reminder_offsets_minutes` must be `[]` for no-reminder modes.

Validation:

- `AT_TIME` requires `start_time` and no `end_time`.
- `TIME_RANGE` requires `start_time` and `end_time`; `end_time` must be after `start_time`.
- `ALL_DAY` requires no start/end time.
- `FLEXIBLE` requires no start/end time.
- When changing an existing activity from a scheduled mode to `ALL_DAY` or `FLEXIBLE`, the frontend must send `start_time: null`, `end_time: null`, and `reminder_offsets_minutes: []`; the backend must persist both time fields as null and clear unsent reminders.

## Location UX

Replace explicit `Location Mode` UI with one smart Location field.

Behavior:

- User types plain text and does not choose a suggestion: save as manual location.
- User chooses a HERE suggestion: save as structured location.
- If user edits the text after selecting a HERE suggestion, clear the structured place and fall back to manual until another suggestion is selected.
- Structured locations show a map/open action on the card.
- Manual locations display as text only.

Implementation should reuse or extract shared behavior from the existing destination autocomplete flow instead of duplicating HERE logic.

## Day Modal

Add/Edit Day stays minimal:

- Label
- Date picker using the shared `DatePicker` / `Calendar` UI

No Day description, templates, or additional metadata in this design.

## Manage Types Modal

Keep custom activity types, but move management into a modal.

Behavior:

- Create custom type.
- Activate/deactivate custom type.
- Delete custom type when allowed by backend rules.
- Do not render type management inline in the timeline.

## Backend Contract Changes

Required:

- Add `FLEXIBLE` to `TimelineActivityTimeMode`.
- Update serializer validation to allow `FLEXIBLE` with no start/end time.
- Reject reminders for `FLEXIBLE`.
- Ensure existing reminder generation only runs for `AT_TIME` and `TIME_RANGE`.
- Ensure switching to `ALL_DAY` or `FLEXIBLE` clears unsent reminder rows and serializes empty reminder offsets.
- Preserve assigned-member status transitions currently allowed by the backend.
- Add tests for `FLEXIBLE` create/update behavior.

No schema migration is required if `time_mode` is a string choice without a database enum constraint. A migration may still be generated if Django detects choice metadata changes; review it before committing.

## Frontend Contract Changes

Required:

- Add `FLEXIBLE` to `TimelineActivityTimeMode`.
- Update create/patch payload handling.
- Update activity form schedule selector.
- Update grouping logic in the timeline view.
- Use section IDs, not dates, for focused/open section URL state.
- Update activity card time label formatting.
- Update tests for `FLEXIBLE`, grouping, and modal behavior.

## Error Handling

- Keep field-specific validation inside the modal.
- Toast successful create/update/delete/status actions.
- Toast or inline-display API errors without clearing the user's input.
- Destructive actions should use confirmation modal/dialog, not `window.confirm`.

## Accessibility

- Modals need focus management, accessible titles, and keyboard close behavior.
- Icon-only actions need `aria-label`.
- Form fields need labels.
- Status menu must be keyboard accessible.
- Toasts should be available through the existing accessible toaster setup.
- Long text in activity titles, locations, and notes must truncate or wrap without breaking layout.

## Testing Plan

Backend:

- Test creating `FLEXIBLE` activity without times.
- Test rejecting `FLEXIBLE` reminders.
- Test patching from scheduled to `FLEXIBLE` clears `start_time`, `end_time`, serialized reminder offsets, and unsent reminder rows.
- Test assigned-member status transitions remain allowed according to the existing limited state machine.
- Run timeline activity CRUD tests.

Frontend:

- Test Activity modal submits correct payloads for all four schedule modes.
- Test smart location field saves manual text and structured HERE selection correctly.
- Test focused Day default selection from trip date/timezone logic.
- Test focused/open section URL state uses section IDs and handles multiple sections on the same date.
- Test grouped rendering: All-day, Timeline, Flexible.
- Test Now marker placement before first item, inside a time range, between items, after last item, and with one scheduled item.
- Test Status Pill Menu actions call existing status API.
- Test Manage Types and Day forms open as modals.

Quality gates:

- Backend changes: `python manage.py test trips`
- Frontend changes: `npm run lint`
- Cross-layer completion: backend tests plus frontend lint; run `npm run build` if route/state behavior changes significantly.

## Non-goals

- No Day descriptions or Day templates.
- No drag-and-drop redesign.
- No map view.
- No automatic status transitions.
- No reminders for all-day or flexible activities.
- No removal of existing backend status fields.

## Implementation Notes

- The existing inline forms can be refactored into modal content rather than rewritten from scratch.
- The current HERE route handlers can remain; the UI should reuse the existing autocomplete behavior.
- The focused Day state should be URL-aware to support reload/share and reduce confusion.
- Status controls should become compact menus rather than multiple visible buttons.
