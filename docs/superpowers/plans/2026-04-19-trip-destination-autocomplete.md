# Trip Destination Search — HERE Migration Plan

> This plan supersedes the previous Google Places implementation plan.

## Source-of-truth replacement

- ~~Google Places autocomplete/details/photo flow~~
- **HERE suggest/lookup flow + provider-neutral contract**
- ~~Auto-cover from provider photo~~
- **Manual cover upload + static default placeholder**

## Phase 1 — Spec and contract reset

- [x] Update design doc to supersede Google assumptions.
- [x] Freeze canonical names:
  - `destination_provider`
  - `destination_provider_id`
  - `/api/location-search/suggest`
  - `/api/location-search/lookup`

## Phase 2 — Backend schema and serializer refactor

- [ ] Add `Trip.destination_provider`.
- [ ] Rename `destination_place_id` -> `destination_provider_id`.
- [ ] Add data migration:
  - set `destination_provider="google"` for legacy provider-id rows
  - clear `cover_image_url` when it matches `/api/places/photo?...`
- [ ] Update serializers/services/views/tests to neutral field names.

## Phase 3 — Frontend domain contract cleanup

- [ ] Update `frontend/features/trips/domain/types.ts`.
- [ ] Replace `destination_place_id` references with `destination_provider_id`.
- [ ] Add `destination_provider` in create/update response flows.

## Phase 4 — BFF provider replacement

- [ ] Delete `frontend/app/api/places/*` route handlers.
- [ ] Add:
  - `frontend/app/api/location-search/suggest/route.ts`
  - `frontend/app/api/location-search/lookup/route.ts`
- [ ] Implement HERE adapter behavior and response normalization in BFF only.
- [ ] Keep auth guard (`401`) and provider-failure mapping (`502`).

## Phase 5 — UI simplification

- [ ] Refactor destination picker to neutral API/types.
- [ ] Remove provider-photo flow completely.
- [ ] Keep `CoverImagePicker` always visible in create/edit forms.
- [ ] Add default asset `frontend/public/images/trip-cover-default.jpg`.
- [ ] Add helper `getTripCoverUrl(cover_image_url)` and use it in cover-rendering surfaces.

## Phase 6 — Cleanup and dead-code removal

- [ ] Remove `GOOGLE_PLACES_API_KEY` runtime usage from code.
- [ ] Remove `/api/places/photo` tests and references.
- [ ] Ensure no browser code calls third-party location providers directly.

## Verification commands

Backend:
```bash
cd backend
python manage.py test trips
```

Frontend:
```bash
cd frontend
npm run lint
```

## Owner runtime setup

1. Create HERE app and API key in Access Manager.
2. Add to `frontend/.env.local`:
```env
HERE_API_KEY=your_here_key
```
3. Keep the key server-only.

