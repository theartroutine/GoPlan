# Trip Detail — Tab Navigation & Overview Redesign

## Context
The current trip detail page is a single flat page with all content in one component (TripOverviewContent).
As GoPlan grows to include Timeline, Expense, Chat, this structure won't scale.
Goal: restructure into tabbed nested routes, redesign Overview, establish foundation for future tab content.

## Decisions
- Nested routes (not query params or in-memory state)
- Tabs: Overview, Member, Timeline, Expenses, Chat
- Timeline / Expenses / Chat: "Coming soon" placeholder
- Leave Trip: right edge of tab bar, non-captain active member only, trip not terminal
- Edit Trip: button in Overview, captain only, links to /trips/[tripId]/edit
- Status card: visible to all; action buttons captain-only; drag-and-drop in separate spec
- Description card: hidden when empty; captain edits via Edit Trip
- Member tab: Captain = full management; Member = read-only list

## Routing
```
app/(shell)/trips/[tripId]/
├── layout.tsx          ← server: unwrap params → TripLayoutClient
├── page.tsx            ← redirect to ./overview
├── overview/page.tsx
├── members/page.tsx
├── timeline/page.tsx   ← coming soon
├── expenses/page.tsx   ← coming soon
└── chat/page.tsx       ← coming soon
```

## Files Changed
See implementation plan: docs/superpowers/plans/2026-04-17-trip-detail-tabs.md
