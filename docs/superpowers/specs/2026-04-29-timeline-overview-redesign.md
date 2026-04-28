# Timeline Overview Redesign

**Status:** Design approved  
**Date:** 2026-04-29  
**Scope:** Frontend only — `features/trips/presentation/timeline-tab.tsx` (overview render path)  
**Out of scope:** Day Detail view, activity cards, backend, BFF

---

## Problem Statement

The current Timeline Overview renders each section (day) as a cramped header row plus a separate summary box beneath it. This creates:

- **Too many competing actions** on one row: date badge, edit icon, delete icon, "Open day" button — all at the same visual weight.
- **A complex date badge** (`SectionDateBadge`) that combines calendar icon + ISO date + a status pill into a single compound component, taking up the majority of horizontal space.
- **A disconnected summary card** (activity count + next activity) as a separate bordered box below the header — visually fragmented from its section.
- **Edit and Delete always visible**, adding icon noise even when the user has no intention to manage the day.

---

## Design Direction: Left-Accent Card

Each section in the overview becomes a **self-contained card** with a colored left-border accent that communicates status at a glance. All existing information is preserved; the layout is reorganised into a logical top-down flow.

---

## Section Card Structure

```
┌─[left accent: 3px]────────────────────────────────────────────┐
│ [Day label — title]                              [··· button]  │
│ [Human-readable date]  [Status pill]                           │
│ [activity chips: "3 scheduled"  "1 all-day"  "1 flexible"]     │
├────────────────────────────────────────────────────────────────┤
│ [Next/Last activity hint]                   [Open day →]       │
└────────────────────────────────────────────────────────────────┘
```

### Row 1 — Title + actions
- `h3` day label: `text-sm font-semibold text-foreground`
- Single `···` icon button (`size-icon-xs`, `variant="ghost"`) replacing separate edit/delete icons
- The `···` button opens a dropdown containing **Edit day** and **Delete day** (delete only shown when section has no activities, matching current `canDeleteDay` logic)

### Row 2 — Date + Status
- Date formatted as `Mon, Jun 2, 2026` using `Intl.DateTimeFormat` with `weekday: "short", month: "short", day: "numeric", year: "numeric"`
- Status pill (`Today` / `Upcoming` / `Past`) sits inline with the date on the same row
- Replaces the current `SectionDateBadge` compound component entirely

### Row 3 — Activity chips
- One chip per non-zero group: `X scheduled`, `X all-day`, `X flexible`
- If today and activities are in progress: additional chip `X in progress` shown first
- If no activities: single dashed chip `No activities yet`
- Chips use existing shadcn/ui style: `rounded-full border bg-muted px-2.5 text-xs`

### Footer strip — Next activity + Open
- Separated by a top border (`border-t border-border/60 bg-muted/30`)
- Left: contextual hint text (see below)
- Right: `Open day →` button (`size="xs"` `variant="outline"`)

---

## Left-Border Accent (Status Color)

Implemented as `border-l-[3px]` on the card, using **existing app color tokens only**:

| Status     | Left border                    | Card border              | Dot                            |
|------------|-------------------------------|--------------------------|-------------------------------|
| `Today`    | `border-l-primary`            | `border-primary/30`      | `bg-primary` + `ring-primary/20` |
| `Upcoming` | `border-l-emerald-500`        | `border-border`          | `border-emerald-500 bg-background` |
| `Past`     | `border-l-border`             | `border-border`          | `border-border bg-muted/40`   |

Dark mode equivalents are provided by the existing token system (`dark:` variants already in use by `datePositionTone()`).

---

## Timeline Dot Colors

The dot (`absolute left-0 top-1 size-4 rounded-full`) gets status-driven styling:

- **Today**: `border-primary bg-primary ring-2 ring-primary/20` (filled, pulse animation kept)
- **Upcoming**: `border-emerald-500 bg-background`
- **Past**: `border-border bg-muted/40`

---

## Status Pill

Replaces the inline `datePositionTone()` span inside `SectionDateBadge`. New standalone pill:

```tsx
<span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", tone)}>
  {datePosition}
</span>
```

Tone classes reuse the existing `datePositionTone()` function output exactly.

---

## Date Formatting

New helper `formatSectionDate(sectionDate: string): string`:

```ts
export function formatSectionDate(sectionDate: string): string {
  const [year, month, day] = sectionDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}
```

Note: No timezone parameter — `sectionDate` is a plain calendar date (`YYYY-MM-DD`) with no time component. `new Date(year, month - 1, day)` creates a local-midnight date, which is correct for display purposes.

---

## Next / Last Activity Hint

Replaces `renderOverviewSummary()`. A new `getOverviewHint(groups, datePosition)` helper in `timeline-view-model.ts` returns a `{ kind: "next" | "last" | "none"; label: string } | null`.

| Context | Text |
|---------|------|
| Today or Upcoming — `groups.timeline` non-empty | `Next: HH:MM – [title]` (first scheduled activity) |
| Past — `groups.timeline` non-empty | `Last: HH:MM – [title]` (last item in sorted `groups.timeline`) |
| Past — no scheduled, has all-day activities | `Last: [title]` (last all-day item) |
| No activities at all | `null` — footer shows nothing on the left |

The `X in progress` chip (Row 3) counts activities where `activity.status === "IN_PROGRESS"`, derived from the existing section `activities` array.

---

## Empty Day Visual Treatment

Days with zero activities render at reduced opacity (`opacity-60`) to visually distinguish "planned" days from "shell" days. This applies to all statuses, not just upcoming.

---

## Toolbar (No structural change)

`+ Add day` (primary) and `⚙ Manage types` (outline) buttons keep their current position and behaviour. No changes.

---

## Now Divider (No change)

The `<NowDivider>` component and `findNowDividerIndex()` logic are preserved without modification.

---

## Components Affected

### Modified
- `timeline-tab.tsx`
  - `renderOverview()` — full rewrite of section card layout
  - `renderOverviewSummary()` — replaced by inline footer hint
  - `renderSectionManagementActions()` — replaced by single `···` DropdownMenu
  - `SectionDateBadge` component — removed (date + status pill rendered inline)
  - `datePositionTone()` — kept, reused for status pill
  - Timeline dot `<span>` — gets status-driven class

### Kept unchanged
- `renderDayDetail()` — not in scope
- `TimelineActivityNode` — not in scope
- All modals, dialogs, hooks — not in scope
- `NowDivider`, `NowMarkerItem` — not in scope
- All backend, BFF — not in scope

---

## Implementation Constraints

- **Use existing Tailwind tokens only** — no hardcoded hex colors. The mock used bright colors to communicate concept; the implementation uses `text-primary`, `border-emerald-*`, `bg-muted`, etc. exactly as the rest of the app does.
- **Dark mode** — all classes must work in dark mode. Use `dark:` variants already established in `datePositionTone()` for the emerald-toned upcoming state.
- **Mobile-first** — card layout must work on 375px+. The footer strip may wrap `Next activity` text to a second line; `Open day →` must stay on its own flex row if space is tight.
- **No new dependencies** — use existing `DropdownMenu`, `Button`, `Tooltip`, `cn` already imported in `timeline-tab.tsx`.
- **Accessibility** — the `···` button must have `aria-label="Day options"` or similar. Dropdown items keep existing accessible roles.

---

## Files Changed

- `frontend/features/trips/presentation/timeline-tab.tsx` — primary change
- `frontend/features/trips/presentation/timeline-tab.test.tsx` — update snapshot/rendering assertions for new card structure
- `frontend/features/trips/presentation/timeline-view-model.ts` — add `formatSectionDate` helper
- `frontend/features/trips/presentation/timeline-view-model.test.ts` — add unit test for `formatSectionDate`
