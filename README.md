# ClawDeploy

ClawDeploy is a one-click OpenClaw deployment platform. It lets authenticated users create, manage, and monitor isolated OpenClaw assistant instances running in Docker containers.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Clerk (authentication)
- Prisma ORM
- Neon PostgreSQL
- Docker Engine
- dockerode

## Prerequisites

- Node.js 22+
- Docker Engine

## Setup

1. Clone the repository:

   ```bash
   git clone <your-repo-url>
   cd clawdeploy
   ```

2. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

3. Configure environment variables:

   ```bash
   cd frontend
   cp .env.local.example .env.local
   ```

4. Push database schema:

   ```bash
   cd frontend
   npx prisma db push
   ```

5. Generate Prisma client:

   ```bash
   cd frontend
   npx prisma generate
   ```

6. Start the development server:

   ```bash
   cd frontend
   npm run dev
   ```

## API Endpoints

| Method | Path | Description | Auth Required |
| --- | --- | --- | --- |
| GET | `/api/health` | Service health and Docker connectivity check | No |
| GET | `/api/instances` | List current user's instances | Yes (Clerk) |
| POST | `/api/instances` | Create a new instance and attempt container startup | Yes (Clerk) |
| GET | `/api/instances/:id` | Get one instance by ID (owned by current user) | Yes (Clerk) |
| PATCH | `/api/instances/:id` | Update one instance by ID | Yes (Clerk) |
| DELETE | `/api/instances/:id` | Delete one instance and remove its container | Yes (Clerk) |
| POST | `/api/instances/:id/start` | Start an instance container and mark status `running` | Yes (Clerk) |
| POST | `/api/instances/:id/stop` | Stop an instance container and mark status `stopped` | Yes (Clerk) |
| GET | `/api/instances/:id/logs` | Fetch container logs (`tail` query supported) | Yes (Clerk) |
| POST | `/api/admin/sync` | Synchronize DB instance status with Docker status | Yes (`x-sync-secret`) |

## Architecture Overview

- Frontend and API are implemented in one Next.js 16 application (`frontend/`) using App Router.
- Authentication is handled by Clerk; user-scoped API routes require a valid Clerk session/JWT.
- Instance records are stored in PostgreSQL through Prisma (`frontend/prisma/schema.prisma`).
- Runtime lifecycle actions (create/start/stop/log/remove) are executed through Docker Engine using `dockerode`.
- A protected admin sync endpoint reconciles database instance state with live Docker container state.

## License

MIT
