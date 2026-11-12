# Richard AI - Educational Content Studio

Teachers pick a curriculum, class, subject and topic, then generate:
Video Script, Lesson Plan, DLP, Notes, Worksheet, Question Paper, Flashcards, Rubric, Quiz, or Slide Outline.

Covers CBSE, ICSE/CISCE, IGCSE, IB, British, American, Qatar National Curriculum, and Custom, for Classes 1 to 12.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and put your key in `ANTHROPIC_API_KEY`.
3. Start the app:
   - Mac/Linux: `export $(cat .env | xargs) && npm start`
   - Windows PowerShell: `$env:ANTHROPIC_API_KEY="your_key"; npm start`
4. Open http://localhost:3000

## Deploy (Render, free tier)

1. Push this folder to a GitHub repository.
2. On render.com, choose New > Blueprint and select the repository. Render reads `render.yaml`.
3. When asked, paste your `ANTHROPIC_API_KEY`.
4. Deploy. Your studio will be at a `.onrender.com` address.

GitHub Pages cannot run this server because it only hosts static files.

## Project layout

- `server.js`: serves the page and securely calls the AI service. The key is never sent to the browser.
- `public/index.html`: the full studio interface, including the curriculum list and the prompt templates.
- `render.yaml`: deployment settings for Render.

## Customising

- **Curricula and subjects:** edit the `CURRICULA` object in `public/index.html`.
- **Prompts:** edit the `TEMPLATES` object in `public/index.html`.
- **Model:** change `STUDIO_MODEL` in your environment settings.
- **Rate limit and size:** constants at the top of `server.js`.

## Notes

- Generated content should be checked by a teacher before use, especially exam questions and syllabus references.
- Saved resources are stored in the user's own browser (localStorage), not on the server.
- Video output is a script and storyboard. Rendering an actual video needs a separate video service.
