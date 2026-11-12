# Richard AI Studio

A premium AI content generator for teachers and education teams.

## Features

- Curriculum-aware content generation
- Teacher resource creation: lesson plans, notes, worksheets, rubrics, quizzes, video scripts, and slides
- Secure local auth and project persistence
- Saved project library per user
- DOCX export and print/PDF support
- Ready for further SaaS upgrades (DB, Stripe, team workspaces, model switching)

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY`.
3. Start the app:
   - Mac/Linux: `export $(cat .env | xargs) && npm start`
   - Windows PowerShell: `$env:ANTHROPIC_API_KEY="your_key_here"; npm start`
4. Open http://localhost:3000

## Environment variables

- `ANTHROPIC_API_KEY`: your Anthropic API key
- `STUDIO_MODEL`: model name (default: `claude-sonnet-5-5`)
- `SESSION_SECRET`: optional session secret for token signing

## Notes

- User accounts and project data are stored locally in `data/users.json` and `data/projects.json`.
- This is a strong base for a SaaS product and can be extended with Stripe, Postgres, or OAuth.
