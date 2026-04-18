# Trip Destination Autocomplete — Design

**Status**: Approved, ready for implementation plan
**Date**: 2026-04-19
**Scope**: Frontend + BFF + Backend

## 1. Problem

In the current Create Trip form (`frontend/features/trips/presentation/create-trip-form.tsx`), the `destination` field is a plain text input. Users type a free-form string, which is stored as `Trip.destination: CharField(max_length=200)`. This is slow to fill, allows typos, and carries no structured data (coordinates, country, imagery), which blocks future features such as maps, weather, and richer trip visualization.

## 2. Goal

When a user creates or edits a trip, typing into the destination field should:

1. Suggest real places (global coverage) as they type.
2. On selection, auto-fill the place name and capture structured data (place_id, lat/lng, country).
3. Fetch a representative photo from the place and use it as the trip's default cover image.
4. Allow the user to override the cover with their own uploaded image before submitting.

## 3. Non-Goals

- POI-level discovery (restaurants, hotels) inside a trip — this is for destination-level search only (city/region).
- Multiple destinations per trip (single destination for now).
- Map rendering of the destination — the stored lat/lng is preparation for a future feature, not part of this scope.
- Migrating existing trips to backfill structured data — new fields are optional, old rows stay as-is.

## 4. Provider Decision

**Selected**: Google Places API (Autocomplete + Details + Photos).

**Rationale**: The user has a Google Payment Method attached. Google provides $200 free credit monthly that resets; at session-token pricing (~$0.041 per complete trip creation), a personal project stays well within the free tier during dev and demo. Alternative providers (Mapbox + Unsplash) were evaluated; Google's strict superiority on real place imagery (vs. stock photos) made it the preferred choice given cost is a non-issue at this scale.

**Risk mitigation**: Configure a monthly spending cap and budget alerts in Google Cloud Console before enabling the APIs. For local development only — not yet deployed to production.

## 5. Architecture

### 5.1 Call Flow

Google Places API is treated as a **UI input helper**, not a domain operation. It is called from the BFF layer, not from Django.

```
Autocomplete / Details / Photo:
  Browser → Next.js Route Handler (BFF) → Google Places API

Trip creation/update:
  Browser → Next.js Route Handler (BFF) → Django → PostgreSQL
```

Django never calls Google Places. It only receives and persists the already-selected place data as part of the trip payload.

### 5.2 Why BFF, not Django

At the autocomplete step there is no business logic — Django would be a pure relay to Google, adding a network hop for zero value. Putting the Google key in the Next.js server runtime (`GOOGLE_PLACES_API_KEY`) keeps it off the browser and consistent with the BFF architecture already used throughout GoPlan.

## 6. Schema Changes

### 6.1 Trip Model (`backend/trips/models.py`)

Add five new fields to `Trip`. All are optional (`blank=True`, `null=True` where applicable) so existing rows and existing tests are unaffected.

| Field | Type | Purpose |
|---|---|---|
| `destination_place_id` | `CharField(max_length=255, blank=True, default="")` | Google Place ID for re-fetch |
| `destination_lat` | `DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)` | Latitude |
| `destination_lng` | `DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)` | Longitude |
| `destination_country_code` | `CharField(max_length=2, blank=True, default="")` | ISO 3166-1 alpha-2 |
| `cover_image_url` | `CharField(max_length=500, blank=True, default="")` | Cover image URL (Google proxy or uploaded media path) |

The existing `destination` field is kept as the human-readable display name (e.g., "Đà Lạt, Lâm Đồng, Vietnam").

A single migration adds all five fields. No data migration needed.

### 6.2 Serializer Changes

- `CreateTripSerializer`: accept the five new fields as optional input.
- `UpdateTripSerializer`: same, all optional.
- Trip detail/list serializers: include the new fields in output.

### 6.3 Service Layer

`services.create_trip` and `services.update_trip` pass the new fields through to the model. No validation beyond serializer-level (lat/lng range, country_code length) is required; the fields are treated as opaque data produced by a trusted UI helper.

## 7. BFF Endpoints

Three new Next.js Route Handlers under `frontend/app/api/places/`. The Google API key lives in `GOOGLE_PLACES_API_KEY` (server-only env var) and never reaches the browser.

### 7.1 `GET /api/places/autocomplete?q={text}&session_token={uuid}`

Proxies Google Places Autocomplete. Returns a trimmed payload:

```json
{
  "suggestions": [
    {
      "place_id": "ChIJ...",
      "main_text": "Đà Lạt",
      "secondary_text": "Lâm Đồng, Vietnam"
    }
  ]
}
```

Uses session tokens to qualify for session-based billing. The frontend generates a UUID session token when the user starts typing and reuses it until a place is selected or the input is cleared.

### 7.2 `GET /api/places/details?place_id={id}&session_token={uuid}`

Proxies Google Places Details, requesting only the fields we need (`location`, `addressComponents`, `photos`). Returns:

```json
{
  "place_id": "ChIJ...",
  "name": "Đà Lạt, Lâm Đồng, Vietnam",
  "lat": 11.9404,
  "lng": 108.4583,
  "country_code": "VN",
  "photo_reference": "places/ChIJ.../photos/ATKogpe..."
}
```

### 7.3 `GET /api/places/photo?ref={photo_reference}&maxwidth=800`

Fetches the photo from Google Places Photo API and streams the image response back to the client. This endpoint becomes the **stable URL** stored in `cover_image_url` — Google-side photo URLs (which embed API keys and have variable lifetimes) are never stored in the database.

Caching: set `Cache-Control: public, max-age=604800` (7 days) to reduce repeated Google calls for popular destinations.

## 8. Frontend Components

### 8.1 `DestinationPicker`

New component at `frontend/features/trips/presentation/destination-picker.tsx`. Replaces the plain `<Input name="destination" />` in both Create and Edit trip forms.

**Behavior**:
- Controlled component with value prop and onChange callback.
- On keystroke: 300ms debounce, then call `/api/places/autocomplete`.
- Renders a dropdown below the input listing up to 5 suggestions.
- On selection: call `/api/places/details`, then preload the cover photo via `/api/places/photo`.
- Emits to parent form a structured value:
  ```ts
  {
    destination: string;
    destination_place_id: string;
    destination_lat: number;
    destination_lng: number;
    destination_country_code: string;
    cover_image_url: string;
  }
  ```

**Accessibility**: keyboard navigation (arrow keys + Enter), ARIA combobox pattern.

**Mobile-first**: Dropdown full-width on mobile, matches input width on desktop. Each suggestion row has adequate tap target (min 44px).

### 8.2 Cover Image Preview + Override

A new section appears below the destination picker once a place is selected:

```
┌─────────────────────────┐
│   [Cover image preview] │
│                         │
│   [ Thay ảnh cover ]    │
└─────────────────────────┘
```

- Default: shows the Google-provided photo loaded via `/api/places/photo?ref=...`.
- "Thay ảnh cover" button opens a file picker.
- On upload: file is sent to Django's new upload endpoint (section 9), the returned URL replaces the cover preview, and is committed as `cover_image_url` on submit.

### 8.3 Integration Points

- `create-trip-form.tsx`: replace `<Input name="destination">` with `<DestinationPicker>` and a `<CoverImagePreview>`. Extend the `CreateTripPayload` type and BFF call.
- `edit-trip-form.tsx`: same replacement; pre-populate the picker with the trip's existing destination string and image.

## 9. User-Uploaded Cover Image

This feature introduces file upload to the project for the first time.

### 9.1 Django Endpoint

`POST /api/media/trip-covers` (multipart/form-data, field name `file`)

- Auth required (same JWT as the rest of the API).
- Scoped throttle class to prevent abuse.
- Validation: content type in {jpeg, png, webp}; file size ≤ 5 MB; image dimensions reasonable (e.g., ≤ 4000×4000).
- Storage: Django default `FileSystemStorage` rooted at `MEDIA_ROOT/trip-covers/`. Filename is a UUID to avoid collisions and to keep user-supplied names out of the URL.
- Response: `{ "url": "/media/trip-covers/<uuid>.jpg" }`.

### 9.2 BFF Proxy

`POST /api/trips/cover-upload` streams the multipart body to Django and returns the resulting URL. Keeps the browser-to-Django rule intact.

### 9.3 Migration Path

This is a simple local-disk implementation suitable for development. The endpoint's response contract (a URL string) does not change when migrating to S3 or similar in the future — only internals move.

## 10. Error Handling

| Failure | Surface |
|---|---|
| Google Autocomplete fails (network, quota, 5xx) | Dropdown shows "Không tải được gợi ý, thử lại." Input stays usable as free text — user can still type a plain destination. |
| Google Details fails after selection | Inline error toast; destination field keeps the selected display name but structured data is left empty. Trip can still be created. |
| Google Photo fails | Cover preview shows a neutral placeholder. User can still upload their own. |
| Upload endpoint fails | Inline error below upload button; Google photo remains as cover. |
| Quota exhausted | Same as generic failure. Dev will see budget alert email before this happens. |

The form is **never blocked** by a Google Places failure — users can always fall back to plain text.

## 11. Security

- `GOOGLE_PLACES_API_KEY` lives in `frontend/.env.local` (dev) and eventual secret manager (prod), never in code or shipped to the browser.
- Google Cloud Console configuration: restrict key to Places API only; set monthly spending cap; enable budget alerts at 50% and 90%.
- Photo proxy endpoint validates that `ref` looks like a Google photo reference (regex gate) before forwarding, to prevent SSRF abuse where someone crafts a URL to probe internal networks via our proxy.
- Upload endpoint validates content type from the decoded bytes (not just the `Content-Type` header) and rejects anything not in the image whitelist.

## 12. Testing

### Backend
- Migration applies cleanly on a DB with existing trips.
- Create/update trip with new fields present → persisted and returned.
- Create/update trip **without** new fields → still succeeds (backward compatibility).
- Upload endpoint: valid image succeeds; oversize, wrong type, unauthenticated requests fail with correct status codes and error codes.

### BFF
- Unit tests per route handler with mocked `fetch` against Google responses.
- 4xx/5xx from Google is translated to a 502 with generic error body (no Google internals leaked).

### Frontend
- `DestinationPicker` renders suggestions on typed input (with debounce).
- Selecting a suggestion populates parent form and triggers photo load.
- Upload button replaces cover preview with uploaded image.

## 13. Out of Scope / Future

- Reverse geocoding of lat/lng.
- Multi-language display names (Google returns locale-dependent text; current scope accepts whatever Google returns for the request's default locale).
- Caching popular places in the Django DB to reduce Google hits further.
- Map view of the destination in the trip detail page.
