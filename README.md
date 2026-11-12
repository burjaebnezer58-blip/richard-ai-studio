# Richard AI Studio

An AI educational-content generator for teachers. It includes a responsive web app, a Node.js/Express API, PostgreSQL-backed accounts and projects, and server-side Anthropic API integration.

## Features

- Generate lesson plans, daily lesson plans, notes, worksheets, question papers, flashcards, rubrics, quizzes, video scripts, and slide outlines.
- Register and log in with passwords hashed using bcrypt.
- Signed 24-hour bearer tokens for API sessions.
- Persist users and saved projects in PostgreSQL.
- Projects are scoped to their owner; the API supports listing, saving, and deleting them.
- Keep the Anthropic API key on the server.
- Export generated content from the browser as a Word-compatible document or print/PDF.

## Run locally

Requirements: Node.js 18+ and PostgreSQL.

1. Create a PostgreSQL database, for example `richard_ai`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `SESSION_SECRET`, and `ANTHROPIC_API_KEY`.
3. Install and start:
   ```sh
   npm install
   npm start
   ```
4. Open http://localhost:3000. The server creates the required tables from `db/schema.sql` on startup.

Set a long, unique `SESSION_SECRET` (at least 32 characters) in every deployed environment. Never commit `.env` or API keys.

## Render deployment

1. Create a PostgreSQL database in Render and a Node web service connected to this repository.
2. Set the web service environment variables: `DATABASE_URL` (from the Render database's internal connection string), `SESSION_SECRET` (a unique random secret of at least 32 characters), and `ANTHROPIC_API_KEY`. Optionally set `STUDIO_MODEL`.
3. Build command: `npm install`. Start command: `npm start`. Health check path: `/health`.
4. Set `TRUST_PROXY=true` when deployed behind Render's proxy.

The repository's `render.yaml` configures the web service, but the database and secrets should be created/configured in Render so deployment does not silently provision a billable database or commit credentials.

## API

- `POST /api/register` — `{ "name", "email", "password" }` (password must be at least 10 characters); returns `{ token, user }`.
- `POST /api/login` — `{ "email", "password" }`; returns `{ token, user }`.
- `GET /api/session` — authenticated user profile.
- `GET /api/projects` — authenticated user's latest 100 projects.
- `POST /api/projects` — authenticated save, accepts `{ "title", "text", "type" }`.
- `DELETE /api/projects/:id` — deletes a project belonging to the authenticated user.
- `POST /api/generate` — authenticated generation, accepts `{ "prompt" }`.
- `GET /health` — reports app/database health.

Authenticated routes use `Authorization: Bearer <token>`.

## Production scope

This provides database-backed auth/projects and an AI generation endpoint; it does not yet include Stripe billing, password-reset email, OAuth, team workspaces, database backups, or a full multi-provider model selector. Add those separately before treating it as a complete commercial SaaS product. The browser stores the bearer token in local storage in the current UI; for higher-security production deployments, replace that with secure, HttpOnly, SameSite cookies and CSRF protection.
