# GoPlan

**A full-stack group trip planning platform** — itineraries, expense settlement, realtime chat, and an AI trip assistant, all sharing one permission model and one source of truth for the trip.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-API-A30000?logo=django&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
[![Live Demo](https://img.shields.io/badge/Live_Demo-goplan.quangmin.me-black?logo=googlechrome&logoColor=white)](https://goplan.quangmin.me)

## Overview

I designed and built GoPlan end-to-end — architecture, backend, frontend, real-time layer, AI integration, and production deployment.

Group trips are rarely planned by one person from start to finish. Friends discuss destinations in one chat app, split costs on another screenshot, and lose the itinerary in a note somewhere. GoPlan centralizes that: one shared workspace where a group takes a trip from first idea to shared memories, with planning, money, communication, and media all sitting on the same trip data under the same permission model.

The system covers account onboarding, friend connections, trip creation and roles, day-by-day itinerary planning with reminders, expense tracking with automatic settlement, realtime chat, an AI assistant that can act on trip data (with human confirmation), photo galleries, and auto-generated highlight videos.

## Live Demo

**[https://goplan.quangmin.me](https://goplan.quangmin.me)**

A seeded demo account is available so you can explore without registering:

```
email:    demo@email.com
password: demo@123456
```

The production environment sends real verification emails too, so creating your own account works if you'd rather do that.

## Feature Highlights

- **Accounts & Profiles** — registration, email verification, password reset, avatar upload with client-side crop/optimization.
- **Friends** — identity-tag search, friend requests, realtime accept/decline.
- **Trip Workspace** — trip creation, cover images, member invitations, captain/member roles, lifecycle status (planning → ongoing → completed/cancelled).
- **Timeline** — per-day itinerary, custom activity types, structured location search (HERE Maps), assignees, activity status, and scheduled reminders.
- **Expenses & Settlement** — expense tracking, per-member contributions, automatic minimum-transfer settlement calculation, and a sent/received confirmation flow for payouts.
- **Realtime Chat** — WebSocket-based trip chat with reactions, per-user/for-everyone deletion, and bulk message management.
- **GoPlanAI** — an in-chat assistant (`@GoPlanAI`) that answers questions about live trip data and can *propose* timeline activities, expenses, or settlement actions — every proposal is a draft the trip captain must explicitly confirm before it touches real data.
- **Photos & Memory Videos** — batch photo upload with client-side WebP optimization, a shareable gallery, and background-rendered highlight videos (Ken Burns + crossfade) with public share links.

## Screenshot Tour

<details open>
<summary><strong>Trip Dashboard & Workspace</strong></summary>
<br>

| | |
|---|---|
| ![Dashboard](.github/assets/readme/screenshots/dashboard.webp) | ![Trip Overview](.github/assets/readme/screenshots/trip-overview.webp) |
| My Trips dashboard after creating a trip | Trip Overview — itinerary summary, budget, members |

![Members](.github/assets/readme/screenshots/members.webp)
<p align="center"><em>Members tab — captain role plus pending friend invitations</em></p>

</details>

<details>
<summary><strong>Timeline & Itinerary Planning</strong></summary>
<br>

| | |
|---|---|
| ![Timeline](.github/assets/readme/screenshots/timeline.webp) | ![HERE Maps](.github/assets/readme/screenshots/here-maps.webp) |
| Day 1 timeline with the first activity added and a live time-tracking indicator | HERE Maps integration for activity locations & directions |

</details>

<details>
<summary><strong>Expenses & Settlement</strong></summary>
<br>

| | |
|---|---|
| ![Settlement](.github/assets/readme/screenshots/expenses-settlement.webp) | ![Transfers](.github/assets/readme/screenshots/expenses-transfers.webp) |
| Finalizing settlement across trip expenses | Minimum peer-to-peer transfer breakdown |

</details>

<details>
<summary><strong>Realtime Chat & GoPlanAI</strong></summary>
<br>

![Chat with GoPlanAI](.github/assets/readme/screenshots/chat-goplanai.webp)
<p align="center"><em>Asked in chat, GoPlanAI drafts three Day 2 activities — the captain reviews Confirm/Cancel on each before anything is saved</em></p>

![GoPlanAI expenses](.github/assets/readme/screenshots/goplanai-expense.webp)
<p align="center"><em>GoPlanAI answering questions about live trip data and proposing a new expense for confirmation</em></p>

</details>

<details>
<summary><strong>Photos & Memory Videos</strong></summary>
<br>

| | |
|---|---|
| ![Photos grid](.github/assets/readme/screenshots/photos-grid.webp) | ![Photo viewer](.github/assets/readme/screenshots/photos-lightbox.webp) |
| Trip photo gallery | Fullscreen photo viewer |

| | |
|---|---|
| ![Memory video](.github/assets/readme/screenshots/memory-video-player.webp) | ![Share memory](.github/assets/readme/screenshots/memory-share.webp) |
| Auto-generated highlight video with Ken Burns + crossfade | Public share link for a memory video |

</details>

<details>
<summary><strong>Friends & Profile</strong></summary>
<br>

| | |
|---|---|
| ![Friends](.github/assets/readme/screenshots/friends.webp) | ![Avatar crop](.github/assets/readme/screenshots/profile-avatar.webp) |
| Friend list after accepting a request | Client-side avatar cropping |

</details>

## Architecture

GoPlan follows a **Backend-for-Frontend (BFF)** architecture: the browser never talks to Django directly for HTTP traffic. Every request goes through a Next.js route handler, which holds the refresh token in an httpOnly cookie and transparently refreshes expired access tokens.

```mermaid
flowchart LR
    Browser["Browser"]
    BFF["Next.js BFF\n(Route Handlers)"]
    Django["Django REST API\n(ASGI · Daphne)"]
    PG[("PostgreSQL")]
    Redis[("Redis\nchannel layer")]
    Celery["Celery Worker\n(memory video render)"]
    AI["DeepSeek API\n(GoPlanAI)"]
    HERE["HERE Maps API"]

    Browser -- "HTTPS pages + API calls" --> BFF
    BFF -- "REST, server-side" --> Django
    BFF -- "location search" --> HERE
    Browser -- "WSS /ws/realtime\n(ticket-authenticated)" --> Django
    Django --> PG
    Django --> Redis
    Django -. "enqueue render job" .-> Celery
    Celery --> PG
    Django -- "tool-calling" --> AI
```

The production deployment runs the same container topology behind a Cloudflare Tunnel with two public hostnames: the app domain forwards everything to the frontend (pages + BFF routes on one origin), while the API domain exposes *only* the ticket-authenticated `/ws/realtime` WebSocket endpoint — the admin panel, schema, and REST endpoints are never publicly reachable. Realtime delivery runs on Django Channels over a Redis channel layer; memory-video rendering runs in Celery workers so it never blocks a web request.

## System Design

The system is modeled with UML use case and sequence diagrams covering every implemented module, kept in sync with the code.

<details>
<summary><strong>Use Case Diagrams</strong> (actor hierarchy + 8 functional domains)</summary>
<br>

| | |
|---|---|
| ![Actors](.github/assets/readme/diagrams/usecase-actors.png) | ![Account](.github/assets/readme/diagrams/usecase-account.png) |
| Actor hierarchy — account/profile states and per-trip roles | Account and authentication |
| ![Friends](.github/assets/readme/diagrams/usecase-friends.png) | ![Trips](.github/assets/readme/diagrams/usecase-trips.png) |
| Friends and social graph | Trip management: creation, membership, lifecycle |
| ![Timeline](.github/assets/readme/diagrams/usecase-timeline.png) | ![Expenses](.github/assets/readme/diagrams/usecase-expenses.png) |
| Timeline planning and activity scheduling | Expenses and settlement |
| ![Chat](.github/assets/readme/diagrams/usecase-chat.png) | ![AI](.github/assets/readme/diagrams/usecase-ai.png) |
| Realtime chat | GoPlanAI assistance and action-draft confirmation |
| ![Memories](.github/assets/readme/diagrams/usecase-memories.png) | |
| Photos and memory videos | |

</details>

<details>
<summary><strong>Sequence Diagrams</strong> (11 core interaction flows)</summary>
<br>

| Diagram | Flow |
|---|---|
| ![SD-01](.github/assets/readme/diagrams/sd01-auth.png) | **SD-01** — Login and protected-request token refresh |
| ![SD-02](.github/assets/readme/diagrams/sd02-websocket.png) | **SD-02** — WebSocket ticket issuance and realtime connection |
| ![SD-03](.github/assets/readme/diagrams/sd03-trip-invite.png) | **SD-03** — Trip creation, invitation, and acceptance |
| ![SD-04](.github/assets/readme/diagrams/sd04-member-remove.png) | **SD-04** — Member removal and chat kicked event |
| ![SD-05](.github/assets/readme/diagrams/sd05-timeline-reminder.png) | **SD-05** — Timeline activity creation and reminder dispatch |
| ![SD-06](.github/assets/readme/diagrams/sd06-settlement.png) | **SD-06** — Expense settlement finalize, reopen, and transfer marks |
| ![SD-07](.github/assets/readme/diagrams/sd07-chat-ai.png) | **SD-07** — Chat message with a GoPlanAI mention |
| ![SD-08](.github/assets/readme/diagrams/sd08-ai-confirm.png) | **SD-08** — AI action-draft refinement and confirmation |
| ![SD-09](.github/assets/readme/diagrams/sd09-photo.png) | **SD-09** — Photo upload and asset download |
| ![SD-10](.github/assets/readme/diagrams/sd10-memory.png) | **SD-10** — Memory-video render and public sharing |
| ![SD-11](.github/assets/readme/diagrams/sd11-notification.png) | **SD-11** — Notification delivery and read synchronization |

</details>

## Security Highlights

- **Refresh tokens in httpOnly cookies only; access tokens in memory only** — never `localStorage`/`sessionStorage`, on web or mobile.
- **Every browser HTTP call goes through the BFF** — Django is never exposed directly to a browser.
- **AI can only propose, never mutate directly** — every GoPlanAI tool call becomes a draft that a human must confirm; captain-managed actions require captain approval.
- **One permission model** answers authorization questions for planning, chat, media, memories, and AI actions alike, enforced at the service layer on every write.
- **No user enumeration** in authentication error messages; scoped rate limiting on sensitive endpoints.
- Public WebSocket surface is a single ticket-authenticated endpoint — the admin panel, API schema, and direct REST routes are not publicly reachable in production.

## Testing & Quality

- **1,099 automated backend tests** (Django) across accounts, friends, trips, timeline, expenses, settlement, notifications, realtime, chat, AI, media, and memories — covering service rules, API contracts, permission checks, money calculations, and AI action drafting.
- **530 automated frontend tests across 96 files** — BFF route handlers, realtime/chat WebSocket behavior, UI components, and domain helpers (money, dates, URL state, and more).
- Static analysis clean; production build passes.
- The full user journey — onboarding → trip planning → expense settlement → chat → AI-assisted actions → photos → memory videos — is additionally verified through a manual acceptance-test walkthrough on the running system.

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| HTTP Integration | Axios, BFF flow (`browser → Next.js Route Handlers → Django`) |
| Realtime | Django Channels over ASGI, Redis channel layer, ticket-authenticated WebSocket |
| Backend | Django 5.2, Django REST Framework, SimpleJWT |
| AI | DeepSeek tool-calling agent, trip-context construction, action-draft confirmation gate |
| Data & Infra | PostgreSQL 16, Redis 7, Celery (background rendering), Podman Compose |
| Media | Client-side WebP optimization, FFmpeg-based memory-video rendering (Ken Burns + crossfade) |
| Maps | HERE REST API for location search and directions |
| Mobile *(in progress)* | Expo SDK 57 (React Native), TypeScript 5, Expo Router — direct-to-Django, no BFF |

## Getting Started

1. Create local environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp backend/db.env.example backend/db.env
   cp frontend/.env.example frontend/.env.local
   ```

2. Start backend services from the repository root:

   ```bash
   podman compose up --build
   ```

3. Start the frontend in a separate terminal:

   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

Local endpoints:

- Frontend app: `http://localhost:3000`
- Django API base: `http://localhost:8000/api/`
- Mailpit UI (captures verification/reset emails locally): `http://localhost:8025`

### Development Notes

- Frontend lint: `cd frontend && pnpm lint`
- Backend tests: `podman compose exec backend python manage.py test`
- Schema changes: `podman compose exec backend python manage.py makemigrations && podman compose exec backend python manage.py migrate`
- Never commit real secret values from local env files.

## Project Structure

- `backend/` — Django project, domain apps, DRF APIs, and tests
- `frontend/` — Next.js app, BFF route handlers, and UI features
- `mobile/` — Expo/React Native client (in progress)
- `postman/` — API collections for manual testing
- `.github/assets/readme/` — screenshots and diagrams used in this README
- `podman-compose.yml` — local infrastructure and backend service orchestration

## Roadmap

- **Task coordination module** — a checklist-based board for assigning trip responsibilities, with deadlines and realtime completion tracking.
- **End-to-end test suite** — browser-driven tests covering the main trip planning journey, complementing the existing unit/integration suites.
- **Expanded AI capabilities** — location-aware itinerary suggestions, budget-conscious expense analysis, and multi-step planning within a single conversation.
- **Richer notifications** — realtime notifications for expense changes, memory-video render completion, and chat `@mentions`.
- **Object storage for media** — an S3-compatible backend for trip photos and rendered videos, enabling horizontal scaling.
- **Observability** — structured log aggregation, a metrics dashboard, and automated backup scheduling.
- **Native mobile app** — a dedicated Expo/React Native client is already underway (`mobile/`), aiming for offline access, native push notifications, and direct camera integration for photo uploads.
