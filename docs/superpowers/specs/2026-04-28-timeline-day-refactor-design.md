# Timeline Day Refactor Design

Date: 2026-04-28
Status: Implementation plan written
Implementation plan: `docs/superpowers/plans/2026-04-28-timeline-day-refactor-implementation.md`

## Objective

Refactor the timeline section model and UI contract so the product has one
business concept: a timeline day.

The current `SYSTEM_DAY` and `SPECIAL_DAY` split is more complex than the
product needs. A day's relationship to the trip date range can be derived from
`section_date` against `trip.start_date` and `trip.end_date`, so it should not be
stored as a separate persisted enum.

## Product Rule

For a given trip, one calendar date has exactly one timeline day.

Examples:

- A trip from `2026-06-01` to `2026-06-03` has days for June 1, June 2, and
  June 3.
- A captain can add an extra day such as `2026-05-31` for preparation.
- A captain cannot add another day on a date that already has a timeline day.

The user-facing language should use `day`, not `special day`.

## Current State

Backend currently stores `TimelineSection.kind` with:

- `SYSTEM_DAY`
- `SPECIAL_DAY`

That kind is used to:

- identify days generated from the trip date range;
- identify days manually added by the captain;
- prevent date edits on system days;
- decide how to preserve data when the trip date range changes.

Recent changes already move the data model toward the target rule by adding a
unique constraint on `trip + section_date`.

## Target Data Model

Keep the existing model name `TimelineSection` for a lower-risk refactor, but
treat it as the implementation name for the product concept "timeline day".

Remove:

- `TimelineSectionKind`
- `TimelineSection.kind`
- the `trip + kind` index
- `TimelineSystemDayLockError`
- API response field `section.kind`
- frontend `TimelineSectionKind`

Keep:

- `TimelineSection.section_date`
- `TimelineSection.label`
- `TimelineSection.is_label_custom`
- `TimelineSection.position` temporarily for API/frontend compatibility
- `TimelineSection.created_by`
- `TimelineSection.updated_by`
- unique constraint on `trip + section_date`

Add to API response:

- `is_in_trip_range: boolean`
- keep `position: number` temporarily until the reorder endpoint and frontend
  tie-break sorting are removed in a later cleanup

`is_in_trip_range` is derived, not persisted:

```text
trip.start_date <= section.section_date <= trip.end_date
```

This field gives the frontend enough information for display behavior without
reintroducing a stored day type.

`position` no longer carries business meaning once `trip + section_date` is
unique. New and synced timeline days should write `position=0`, the reorder
endpoint should remain harmless, and frontend sorting may keep `position` only as
a compatibility tie-breaker.

## Backend Behavior

Rename the sync concept from system-day sync to timeline-day sync in services
and tests.

The new sync behavior:

1. For every date in `trip.start_date..trip.end_date`, ensure one
   `TimelineSection` exists.
2. If a day in the trip range is missing, create it with generated label
   `Day N` and `is_label_custom=False`.
3. If an existing day in range has `is_label_custom=False`, update its generated
   label to the current `Day N`.
4. If an existing day in range has `is_label_custom=True`, preserve its label.
5. For days outside the trip range:
   - delete the day only when it has no activities and `is_label_custom=False`;
   - preserve the day when it has activities or a custom label.

This preserves user-entered work without needing `SYSTEM_DAY` or `SPECIAL_DAY`.

Timeline-day sync must run in the same transaction after any mutation that can
break the in-range invariant:

- trip date-range changes;
- `section_date` patch when the source date was in range or the final date is in
  range;
- delete of an empty in-range day.

Mutation responses can still return the directly changed section, but the
database state must already contain all required in-range days before the request
commits. Timeline reads must not be the only repair mechanism.

## Section Mutations

Create day:

- Captain only.
- Reject if `trip + section_date` already exists.
- Create with `is_label_custom=True` because the captain supplied the label.

Patch day:

- Captain only.
- Allow label edits for all days.
- Allow `section_date` edits for all days, as long as the target date is not
  already used by another day in the same trip.
- Regenerate unsent reminders when the date changes.
- Evaluate label customness against the final `section_date`, not the original
  date.
- If the final date is in range and the submitted or preserved label equals the
  generated `Day N` for that final date, set `is_label_custom=False`.
- If the final date is in range, no label was submitted, and the existing day had
  `is_label_custom=False`, immediately update `label` to the generated `Day N`
  for the final date and keep `is_label_custom=False`.
- If the final date is in range and the submitted or preserved label does not
  equal the final generated label, set `is_label_custom=True`.
- If the final date is outside the trip range, there is no generated label. The
  final state must have `is_label_custom=True`; if no label was submitted,
  preserve the current display label as a custom label.
- After a date change, run timeline-day sync before returning so moving an
  in-range day outside the trip range immediately recreates the required
  in-range day.

Delete day:

- Captain only.
- Keep the current "cannot delete non-empty day" rule.
- Deleting an empty outside-range day removes it.
- Deleting an empty in-range day is allowed only if the backend runs
  timeline-day sync in the same transaction, so the required in-range date is
  recreated before the request commits.
- If product wants stronger UX later, the frontend can hide delete for in-range
  days, but this refactor's backend invariant is immediate sync, not eventual
  repair on a later trip date update.

Reorder sections:

- The endpoint is now mostly obsolete because each date has one day.
- Keep it temporarily for compatibility, but simplify tests to only verify it is
  harmless for a single day.
- A later cleanup can remove the endpoint once the frontend no longer calls it.

## API Contract

Timeline section response changes from:

```json
{
  "id": "...",
  "kind": "SYSTEM_DAY",
  "section_date": "2026-06-01",
  "label": "Day 1"
}
```

to:

```json
{
  "id": "...",
  "section_date": "2026-06-01",
  "label": "Day 1",
  "is_label_custom": false,
  "position": 0,
  "is_in_trip_range": true
}
```

Single-section mutation responses and list/detail timeline responses must expose
the same section shape: no `kind`, with `position`, `is_label_custom`, and
`is_in_trip_range`.

Serializer payload builders should receive the parent `trip` explicitly instead
of lazily reading `section.trip` for each section:

```python
serialize_section(section, *, trip)
_section_payload(section, *, trip, ...)
```

`build_timeline_response` already has the parent trip and should pass it into
each section payload. Create, patch, and reorder views should either receive the
trip from the service layer or select sections with the trip context before
serializing. This keeps mutation responses consistent with list responses and
avoids accidental N+1 queries for the derived `is_in_trip_range` field.

The frontend BFF routes do not need architectural changes. Browser requests
continue to go through Next.js route handlers before reaching Django.

## Frontend Behavior

Remove frontend dependence on `section.kind`.

Changes:

- Rename user-facing "special day" text to "day" or "extra day".
- `TimelineSection` type removes `kind`, adds `is_in_trip_range`, and keeps
  `position` temporarily.
- The add-day form still disables dates that already have timeline days.
- The edit-day form allows date edits for every day.
- Delete affordance should be based on `section.activities.length === 0`, not
  `section.kind`.
- Timeline focus logic should not prefer `SYSTEM_DAY`; it should use sorted
  sections and `is_in_trip_range`.

Recommended focus behavior:

- If today matches a day, focus that day.
- If today is before the trip's first in-range day, focus the first in-range day.
- If today is after the trip's last in-range day, focus the last in-range day.
- Otherwise use the first sorted day as fallback.

## Migration Strategy

The current uncommitted migration `0007_unique_timeline_section_date.py` already
merges duplicate sections before adding unique `trip + section_date`.

Preflight before editing migration files:

1. Check applied migration state with `showmigrations trips` or
   `django_migrations`.
2. If `0007_unique_timeline_section_date` is unapplied everywhere relevant,
   replace it in place.
3. If `0007_unique_timeline_section_date` has been applied in any shared
   environment, do not rewrite it. Create a follow-up migration instead.
4. If it has only been applied in a disposable local/dev database, either roll
   back to the previous migration and reapply, or document the explicit
   rollback/fake steps before proceeding. Do not leave migration history and DB
   state drifting silently.

If preflight permits replacing `0007_unique_timeline_section_date.py`,
implementation should replace it with a single migration that:

1. Merges duplicate sections by `trip + section_date`.
2. Moves activities from duplicate sections to the keeper section.
3. Removes the old conditional unique constraint.
4. Adds the new unique `trip + section_date` constraint if not already present.
5. Removes the `kind` field and related index.

Keeper policy for duplicates:

- Prefer a section with activities.
- If more than one section has activities, keep the earliest by
  `position, created_at, id`.
- If no section has activities, keep the earliest by `position, created_at, id`.
- Preserve the keeper's label and metadata.
- Move duplicate activities to the keeper and renumber activity positions.

This policy is deterministic and avoids trying to merge multiple labels into one
display label.

## Tests

Backend tests to update:

- trip creation seeds timeline days;
- creating a day rejects an existing date;
- patching any day can change date when the date is free;
- patching any day rejects an existing date;
- patching a generated in-range day to another in-range date updates the label
  to the final generated `Day N`;
- patching a generated in-range day outside the trip range makes the final day
  custom and immediately recreates the missing in-range day;
- patching with an omitted label preserves custom labels and does not leave
  `is_label_custom=False` outside the trip range;
- deleting an empty in-range day immediately recreates the required generated
  day;
- date-range expansion creates missing days;
- date-range expansion reuses existing extra days;
- date-range shrink deletes empty generated outside-range days;
- date-range shrink preserves outside-range days with activities;
- date-range shrink preserves outside-range days with custom labels;
- timeline detail and mutation responses return `position` and
  `is_in_trip_range`, and no `kind`;
- migration duplicate merge behavior is covered.

Frontend tests to update:

- add day modal text;
- date picker disables existing timeline days;
- edit day allows date edits;
- delete empty day does not depend on `SPECIAL_DAY`;
- focus model uses `is_in_trip_range`, not `SYSTEM_DAY`.

## Scope Boundaries

Do not change activity type `kind` values such as `SYSTEM` and `CUSTOM`; those
belong to timeline activity classification, not timeline days.

Do not rename every file/component from "section" to "day" in this pass unless a
file is already being touched for the contract change. The product behavior is
the priority; broad naming cleanup can be a follow-up.

No GitHub issue was provided in this thread. If there is an existing issue for
timeline UX or timeline data modeling, update that issue body before
implementation if this design deviates from it.

## Risks

- This is a backend/frontend contract change. Backend serializers, frontend
  domain types, tests, and UI logic must land together.
- Existing uncommitted timeline work is present in the worktree. Implementation
  must preserve unrelated edits and avoid reverting user changes.
- Migration policy can drop labels from duplicate sections that are not kept.
  That trade-off is accepted for this refactor because the final product rule
  allows only one day per date.

## Verification

Minimum verification after implementation:

- `podman compose exec backend python manage.py makemigrations --check --dry-run`
- `podman compose exec backend python manage.py test trips`
- `npm run lint`
- `npm test -- timeline-tab.test.tsx timeline-view-model.test.ts`

Run `npm run build` if route or app-level frontend contract changes require a
full Next.js validation pass.
