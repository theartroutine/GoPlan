# GoPlan

GoPlan is a group trip planning web application for friends, families, and teams.
The project aims to centralize trip coordination in one place, including account onboarding,
friend connections, notifications, itineraries, expenses, tasks, and real-time communication.

## Current Scope

The repository already contains working foundations for:

- account registration, login, profile setup, email verification, and password reset
- friend search, friend requests, and friend list management
- notifications APIs and frontend integration
- real-time authentication groundwork for websocket-based features

Trip planning domains such as itineraries, expenses, task coordination, and in-trip chat are
part of the product direction and will continue to be built on top of this base.

## Architecture

GoPlan follows a BFF architecture:

`browser -> Next.js Route Handlers -> Django REST API -> PostgreSQL`

This keeps browser clients isolated from direct Django access and gives the frontend a stable
server-side integration layer for auth, API shaping, and future cross-service orchestration.

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui
- API integration: Axios with BFF route handlers in Next.js
- Backend: Django 5.2, Django REST Framework, SimpleJWT
- Data and infra: PostgreSQL 16, Redis 7, Podman Compose, Mailpit

## Local Setup

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
npm install
npm run dev
```

Local endpoints:

- Frontend app: `http://localhost:3000`
- Django API base: `http://localhost:8000/api/`
- Mailpit UI: `http://localhost:8025`

## Project Structure

- `backend/` - Django project, domain apps, DRF APIs, and tests
- `frontend/` - Next.js app, BFF route handlers, and UI features
- `postman/` - API collections for manual testing
- `report/` - project notes and explanation documents
- `podman-compose.yml` - local infrastructure and backend service orchestration

## Development Notes

- Frontend lint:

```bash
cd frontend
npm run lint
```

- Backend tests:

```bash
podman compose exec backend python manage.py test
```

- When schema changes are introduced:

```bash
podman compose exec backend python manage.py makemigrations
podman compose exec backend python manage.py migrate
```

- Never commit real secret values from local env files.
