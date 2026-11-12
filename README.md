# Richard AI Studio

An AI educational-content generator with a responsive frontend, Express API, PostgreSQL-backed accounts and projects, and server-side Anthropic integration.

## Run locally

Requirements: Node.js 18+ and PostgreSQL.

1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env`; configure `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), and `ANTHROPIC_API_KEY`.
3. Install and start:
   ```sh
   npm install
   npm start
   ```
4. Open http://localhost:3000. The API initializes tables from `db/schema.sql` when starting.

## App features

- Register/login and signed bearer sessions.
- Generate lesson plans, DLPs, notes, worksheets, question papers, flashcards, rubrics, quizzes, video scripts, and slide outlines.
- Save, open, and delete user-owned projects in PostgreSQL.
- Copy, Word-compatible export, and print/save as PDF.
- Server-side API key storage; never place provider keys in frontend code.

## Environment

See `.env.example`. Production must use a unique random `SESSION_SECRET`; set `TRUST_PROXY=true` behind Render's proxy. Do not commit `.env` or secrets.

## Deploy on Render

Connect this repository as a Node web service, use `npm install` / `npm start`, and set `/health` as health check. Configure `DATABASE_URL`, `SESSION_SECRET`, and `ANTHROPIC_API_KEY` in the Render dashboard. Set `TRUST_PROXY=true`. The provided `render.yaml` describes the web service; create/configure the Postgres database separately and use its connection string.

## Current scope

This version includes PostgreSQL auth/projects and AI generation. It does not yet include Stripe billing, team workspaces, password reset, OAuth, or multi-provider model selection. The browser currently uses a bearer token in localStorage; for higher-security deployments, consider migrating to Secure, HttpOnly, SameSite cookies with CSRF protection.
