# Trip Destination Search — HERE Migration Design

**Status**: Approved (supersedes Google-based design)
**Date**: 2026-04-20
**Scope**: Frontend + BFF + Backend

## 1. Decision Reset

This document supersedes the previous Google-dependent destination design.

- ~~Selected provider: Google Places API (Autocomplete + Details + Photos)~~
- **Selected provider: HERE Geocoding & Search (suggest + lookup)**
- ~~Trip cover default comes from provider photo~~
- **Trip cover policy is now permanent: manual upload or app-owned default placeholder**

Reason for replacement: Google Maps Platform prohibited territories currently list Vietnam.

## 2. Product Goal (Unchanged)

When creating/editing a trip, destination input should:

1. Suggest real places quickly.
2. Persist structured destination data.
3. Keep cover-image UX stable even when provider media is unavailable.

## 3. Contract Changes

### 3.1 Backend trip fields

Keep:
- `destination`
- `destination_lat`
- `destination_lng`
- `destination_country_code`
- `cover_image_url`

Replace:
- `destination_place_id` -> `destination_provider_id`

Add:
- `destination_provider` (`"" | "here" | "google"` historical)

Rules:
- `cover_image_url` stores uploaded media URL only.
- Provider photo URLs are never stored.
- Empty `cover_image_url` means UI fallback to static placeholder.

### 3.2 Frontend normalized interfaces

```ts
type LocationSuggestion = {
  provider: "here";
  provider_id: string;
  title: string;
  subtitle: string;
};

type ResolvedDestination = {
  destination: string;
  destination_provider: "here";
  destination_provider_id: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country_code: string;
};
```

## 4. BFF API Changes

Remove:
- `/api/places/autocomplete`
- `/api/places/details`
- `/api/places/photo`

Add:
- `GET /api/location-search/suggest?q={text}`
- `GET /api/location-search/lookup?id={provider_id}`

Notes:
- Browser never calls HERE directly.
- Normalization happens in BFF only.
- `401` for unauthenticated; provider/network failures map to generic `502`.

## 5. Data Migration Rules

Schema:
- Add `destination_provider`
- Rename `destination_place_id` -> `destination_provider_id`

Data migration:
- If legacy provider id exists, set `destination_provider = "google"`.
- If `cover_image_url` matches legacy Google proxy pattern (`/api/places/photo?...`), clear to `""`.

## 6. UX Policy

### 6.1 Destination picker
- Debounced suggestion list.
- Selected suggestion resolves structured destination fields.
- No provider photo logic.

### 6.2 Cover behavior
- `CoverImagePicker` is always visible in create/edit forms.
- Default preview image: `frontend/public/images/trip-cover-default.jpg`.
- Uploaded image replaces placeholder.
- If no upload, placeholder is used across trip surfaces via one shared helper.

Helper:
- `getTripCoverUrl(cover_image_url: string): string`

## 7. Environment

- Add `HERE_API_KEY` (server-only, in `frontend/.env.local`).
- Add `ENABLE_HERE_LOCATION_SEARCH` as the explicit local kill switch. Default must stay off unless a local demo needs HERE.
- Add optional local safety rails:
  - `HERE_LOCATION_SEARCH_MAX_REQUESTS_PER_MINUTE`
  - `HERE_LOCATION_SEARCH_SUGGEST_CACHE_TTL_MS`
  - `HERE_LOCATION_SEARCH_LOOKUP_CACHE_TTL_MS`
- Remove runtime dependency on `GOOGLE_PLACES_API_KEY`.

Guard policy:
- HERE usage is local-development only.
- Production must fail closed even if `HERE_API_KEY` is present.
- When disabled or rate-limited, the destination field falls back to plain text entry instead of blocking trip create/edit.

## 8. Security and Architecture Invariants

- Preserve BFF rule: `browser -> Next.js route handlers -> Django`.
- Do not expose provider keys to browser code.
- No code path may call Google Places after migration.

## 9. Verification Checklist

Backend:
- Migration applies on Google-era schema.
- Data migration sets historical `destination_provider="google"` where applicable.
- Legacy Google proxy cover URLs are cleared.

BFF:
- Suggest and lookup return normalized contracts.
- Missing lookup id returns `400`.
- HERE internal errors are not leaked.

Frontend:
- Destination search works with debounced suggestions.
- Selecting destination does not mutate cover automatically.
- Placeholder appears when cover URL is blank in create/edit/detail/list contexts where cover is rendered.
