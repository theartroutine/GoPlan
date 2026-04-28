# Timeline Now Indicator — Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Context

The Timeline currently has a `NowMarkerItem` — a subtle horizontal divider with a "Now" pill that appears between activities inside the focused (today's) section, but only when that section is expanded. Users cannot see where "now" is in the timeline without opening the today section, making it hard to track real-time trip progress at a glance.

This spec adds a two-level Now indicator system:
1. A **section-level NowDivider** always visible between today's section and tomorrow's — works regardless of expanded/collapsed state
2. An **enhanced activity-level NowMarkerItem** with live time display inside expanded sections

Business constraint: only one section per date is allowed, simplifying position logic.

---

## Architecture

### Two-level system

| Level | Component | Visibility | Purpose |
|---|---|---|---|
| Section-level | `NowDivider` (new) | Always visible | Shows today/tomorrow boundary in the section list |
| Activity-level | `NowMarkerItem` (enhanced) | Only in expanded today section | Shows precise position among activities |

Both levels share a single `useNow(timezone)` hook for live time updates.

### Live clock — `useNow(timezone)`

New function inside `timeline-tab.tsx` (not a shared hook file — scoped to this component).

```typescript
function useNow(timeZone: string): { displayTime: string; date: string; minutes: number }
```

- Uses `useState(() => new Date())` + `setInterval` every 60 seconds
- `displayTime`: `"HH:MM"` formatted in trip timezone (24h)
- `date`: `"YYYY-MM-DD"` in trip timezone
- `minutes`: minutes since midnight in trip timezone (for activity-level logic)
- Cleans up interval on unmount

---

## View model changes (`timeline-view-model.ts`)

### `findNowDividerIndex` (new, exported)

```typescript
function findNowDividerIndex(sections: TimelineSection[], today: string): number | null
```

- Receives the already-sorted sections array and today's date string (`"YYYY-MM-DD"`)
- Returns the **index** of the today section in the array — NowDivider is rendered after `sections[index]`
- Returns `null` if no section matches today (trip hasn't started or has ended)
- If today is the last section: returns its index (NowDivider renders after the last section)

### `getActiveActivityIds` (new, exported)

```typescript
function getActiveActivityIds(activities: TimelineActivity[], minutes: number): Set<string>
```

- Returns a `Set<string>` of IDs for all `TIME_RANGE` activities where `start ≤ minutes < end`
- Used to mark multiple overlapping activities as `isCurrent=true` simultaneously
- Only considers `TIME_RANGE` activities (AT_TIME activities are instantaneous, no duration)
- `getNowMarkerPlacement` is unchanged — still determines the single position of the Now line in the activity list

---

## Visual design

### NowDivider (section-level)

Full-width horizontal element inserted in the sections render loop. Shares the `relative pl-7` layout of sections so its dot aligns with the timeline's vertical line.

```
●━━━━━━━━━━━━━━[ Now · 18:25 ]━━━━━━━━━━━━━━━
```

- **Left dot**: `absolute left-0`, `size-4 rounded-full bg-primary ring-2 ring-primary/20 animate-pulse` — solid filled (vs section dots which use border-only), glow ring, pulse animation signals "live"
- **Horizontal line**: `h-0.5 bg-primary/70` on both sides of the badge — twice as thick as section's vertical line (`w-px`)
- **Badge**: `bg-primary text-primary-foreground rounded-full px-3 py-0.5 text-xs font-semibold` — solid primary fill, white text. Content: `"Now · HH:MM"`
- **Vertical spacing**: `my-1` (tight, doesn't push sections apart significantly)

### NowMarkerItem (activity-level, enhanced)

```
  • ──────────── Now · 18:25 ────────────
```

- **Left dot**: `size-1.5 rounded-full bg-primary animate-pulse shrink-0` — significantly smaller than NowDivider dot, establishes clear hierarchy
- **Lines**: `h-0.5 flex-1 bg-primary/50` — upgraded from `h-px bg-primary/40`
- **Badge**: keeps soft style `bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5 text-xs font-semibold text-primary` — adds time: `"Now · HH:MM"`

### Visual hierarchy

| Element | Badge style | Line thickness | Dot |
|---|---|---|---|
| NowDivider | Solid `bg-primary` (white text) | `h-0.5` (0.125rem) | Filled + ring + pulse |
| NowMarkerItem | Soft `bg-primary/10` | `h-0.5` | Tiny pulse dot |
| Section dot (focused) | — | — | Border-only `border-primary` |

The three elements are visually distinct: NowDivider is the most prominent, NowMarkerItem is subordinate, and the Focused section dot is a separate concept.

---

## Component changes (`timeline-tab.tsx`)

### `NowDivider` component (new)

```tsx
function NowDivider({ displayTime }: { displayTime: string }) { ... }
```

Props: `displayTime` string (e.g., `"18:25"`). No timezone logic inside — caller provides formatted time.

### `NowMarkerItem` component (enhanced)

Add `displayTime` prop. Content changes from `"Now"` to `"Now · HH:MM"`. Add small pulse dot on left.

### Render loop

```tsx
const nowDividerIndex = findNowDividerIndex(timelineData.sections, now.date);

timelineData.sections.map((section, index) => {
  return (
    <Fragment key={section.id}>
      {renderSection(section)}
      {index === nowDividerIndex && <NowDivider displayTime={now.displayTime} />}
    </Fragment>
  );
})
```

### `renderSectionContent` update

Pass `now.minutes` instead of re-calling `new Date()`. Use `getActiveActivityIds` to compute the full set of currently-active activities:

```tsx
const activeIds = getActiveActivityIds(groups.timeline, now.minutes);
// isCurrentActivity checks activeIds instead of placement.kind === "inside"
```

---

## Edge cases

| Situation | Behaviour |
|---|---|
| Trip not started (today < first section date) | `findNowDividerIndex` → `null`, no NowDivider rendered |
| Trip ended (today > last section date) | Same — no NowDivider |
| Today is the last section | NowDivider renders after the last section |
| Today section is expanded | NowDivider still renders after section content; activity-level marker shows inside |
| No timed activities in today section | `getNowMarkerPlacement` → `none`, no activity-level marker. NowDivider still shows |
| Multiple TIME_RANGE activities overlap | All active IDs in `getActiveActivityIds` get `isCurrent=true`. Now line position (from `getNowMarkerPlacement`) is unchanged — anchors to first overlapping activity |
| `now.date` differs from `section_date` timezone | Both use trip timezone consistently via `useNow(trip_timezone)` |

---

## Tests

### `timeline-view-model.test.ts` — additions

**`findNowDividerIndex`:**
- Returns correct index when today matches a section date
- Returns `null` when today is before all sections
- Returns `null` when today is after all sections
- Returns last index when today is the last section

**`getActiveActivityIds`:**
- Returns IDs of all TIME_RANGE activities that cover current minutes
- Ignores AT_TIME and ALL_DAY activities
- Handles overlapping ranges (both A and B returned when both cover now)
- Returns empty set when no activities are active
- Handles null start_time or end_time gracefully

### Manual verification

1. Set system clock to trip date and confirm NowDivider appears between today and tomorrow
2. Collapse today's section — NowDivider still visible
3. Expand today's section — both NowDivider and activity-level marker visible simultaneously
4. Wait 1 minute — time in both markers updates
5. Test with trip dates in the past / future — NowDivider absent
6. Add two overlapping TIME_RANGE activities for the current hour — both show `isCurrent` highlight

---

## Files to modify

| File | Change |
|---|---|
| `frontend/features/trips/presentation/timeline-view-model.ts` | Add `findNowDividerIndex`, `getActiveActivityIds` |
| `frontend/features/trips/presentation/timeline-tab.tsx` | Add `useNow`, `NowDivider`, update `NowMarkerItem`, update render loop and `renderSectionContent` |
| `frontend/features/trips/presentation/timeline-view-model.test.ts` | Add tests for 2 new functions |
