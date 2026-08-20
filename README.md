# webpf

Personal portfolio website with a Python + FastAPI backend chatbot and a React + Vite frontend.

- **Frontend (Vercel):** React + Vite. Loads and parses its own bundled portfolio content (no backend call needed) and renders an always-visible AI chatbot sidebar plus a contact form.
- **Backend (Render):** FastAPI. Serves a chat API (backed by its own separate content file), a contact/email API, and health checks.
- **OpenAI:** Used only on the backend. The frontend never calls OpenAI directly.
- **Content:** the website's content and the chatbot's knowledge are two independent markdown files — see [Updating content](#updating-content) below.

For a deeper dive into architecture, request flows, and known limitations, see [DOCUMENTATION.md](DOCUMENTATION.md).

---

## Prerequisites

- Python 3.11+ with a virtualenv tool of your choice
- Node.js 18+ and npm
- An OpenAI API key (optional locally — you can run in mock mode without one)
- A Gmail account + [App Password](https://myaccount.google.com/apppasswords) (optional locally — the contact form can run in mock mode without one)

---

## Local development

### 1. Backend

```bash
cd backend
python3 -m venv .venv        # or use your own existing virtual environment
source .venv/bin/activate    # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` as needed, then run:

```bash
uvicorn app.main:app --reload
```

The API is now available at `http://127.0.0.1:8000` (interactive docs at `http://127.0.0.1:8000/docs`).

**Local `.env` options:**

- `CHAT_MODE=mock` — test the chatbot without calling OpenAI (returns a canned response). Set `CHAT_MODE=openai` and provide `OPENAI_API_KEY` to use the real model.
- `CONTACT_MODE=mock` — test the contact form without sending real email. Set `CONTACT_MODE=smtp` with `SMTP_USER`/`SMTP_PASSWORD` (a Gmail App Password) to actually send mail.
- `CORS_ORIGINS` — JSON array of allowed frontend origins. The default already covers common local Vite ports (`5173`–`5175`) and `3000`.

### 2. Frontend

In a separate terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The dev server starts on `http://localhost:5173` (Vite will pick the next free port if it's taken) and expects the backend at `http://127.0.0.1:8000` by default (override via `VITE_API_BASE_URL` in `frontend/.env`).

Open the printed local URL in your browser — you should see the portfolio content (loaded and parsed client-side from a bundled file — no backend call) alongside the chatbot sidebar and the contact form.

---

## Updating content

The website's content and the chatbot's knowledge are **two separate files**, so you can edit them independently:

| File | Used by | Effect |
|---|---|---|
| `backend/app/content/chatcontent.md` | Chatbot only (`/api/chat`) | What the AI assistant knows and answers from. Not shown on the website. |
| `frontend/public/content/websitecontent.md` | Website only (portfolio UI) | What visitors see on the page. Not sent to the chatbot. |

They start out as copies of each other but are expected to diverge over time — e.g. you might want the chatbot to know extra detail that isn't worth cluttering the page with, or vice versa.

### Editing what the chatbot knows

1. Edit `backend/app/content/chatcontent.md`.
2. **Restart the backend** (local) or **redeploy** (Render) — the file is what ships with the deployed backend, so a redeploy is required for the change to reach production (the content itself isn't cached in-process, so a local `--reload` picks it up immediately).

### Editing what the website displays

1. Edit `frontend/public/content/websitecontent.md` (see the existing content and `frontend/src/services/fixtures/samplePortfolio.md` for the expected section structure: header block, `# Summary`, `# Technical Skills`, `# Experience`, `# Education`, `# Projects`, `# Honors-Awards`, `# Contact`).
2. It's fetched and parsed client-side, so a local `npm run dev` picks up saved changes immediately; production needs a **redeploy** (Vercel) since it's bundled as a static asset at build time.
3. Run `npm test -- portfolioParser` if you change the structure, to make sure the parser still reads it correctly.

---

## Tests

### Backend (pytest)

```bash
cd backend
source .venv/bin/activate    # or your own environment with requirements.txt installed
pytest
```

Runs three suites (19 tests):

- `tests/test_api.py` — end-to-end endpoint tests (health, chat/contact in mock mode, validation errors) using FastAPI's `TestClient`. Also covers the error-handling paths: a `ChatServiceError`/`EmailServiceError` from the service layer returns HTTP 503 with a clean message, and any *unexpected* exception is caught by the app-wide handler in `app/main.py` and returned as a plain `{"detail": "Internal server error"}` JSON 500 — never a raw traceback. These force `CHAT_MODE=mock`/`CONTACT_MODE=mock` so no external API calls or real emails happen.
- `tests/test_email_service.py` — unit tests for the SMTP email service: mock mode, missing SMTP credentials, and translation of `smtplib` auth/connection failures into `EmailServiceError`.
- `tests/test_openai_service.py` — unit tests for the chat service: mock mode, empty-message rejection, missing API key, and translation of OpenAI SDK errors (e.g. connection failures) into `ChatServiceError`.

Note: there's no backend test for markdown parsing anymore — that logic (and its tests) moved to the frontend along with the website-content parsing (see below), since the backend no longer parses `chatcontent.md` into anything structured.

Requires `pytest-asyncio` (in `requirements.txt`) since the chat service tests are `async`.

Run a single file or test during development, e.g.:

```bash
pytest tests/test_api.py::test_chat_mock_mode -v
```

### Frontend (Vitest + React Testing Library)

```bash
cd frontend
npm install       # first time only, installs the test dependencies too
npm test          # run once (CI mode)
npm run test:watch     # re-run on file changes during development
npm run test:coverage  # run with a coverage report
```

Runs 26 tests across 7 files:

- `src/services/portfolioParser.test.ts` — the markdown → structured-`Portfolio` parser (a TypeScript port of the original backend parser), against a fixture and against the real bundled `websitecontent.md`.
- `src/services/portfolio.test.ts` — `loadPortfolio()`: fetching and parsing `websitecontent.md` successfully, a missing-file response, and a network failure.
- `src/services/api.test.ts` — the backend-call `fetch` wrapper layer (`sendChatMessage`, `sendContactMessage`, `pingBackend`): backend error messages (both a plain `detail` string and a Pydantic validation-error array), network failures, request timeouts, and non-JSON responses (e.g. a gateway error page instead of JSON).
- `src/components/ChatbotWidget.test.tsx` — greeting message, backend-status pill (Live/Offline), sending a message and rendering the reply, suggested-prompt chips, and the error path when the chat request fails.
- `src/components/ContactForm.test.tsx` — submit-button gating until all fields are filled, successful submission (success message + form reset), and the error path when submission fails (form data is preserved so the user doesn't have to retype it).
- `src/App.test.tsx` — loading state, successful portfolio render, and the error state with its retry button.
- `src/components/ErrorBoundary.test.tsx` — renders children normally, and falls back to a "Something went wrong" screen with a reload button if a child throws during render.

Also run a type-check (the build step doesn't type-check by default, since Vite transpiles with esbuild):

```bash
npx tsc --noEmit
```

---

## Deployment

### Backend → Render

1. Create a new **Web Service** on Render, connect this repo, and set the root directory to `backend`.
2. Render will pick up `backend/render.yaml` (Blueprint) for build/start commands and health check path. If configuring manually instead:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/api/health`
3. Set these environment variables in the Render dashboard (marked `sync: false` in `render.yaml`, so they must be entered manually — never committed to the repo):
   - `OPENAI_API_KEY`
   - `CHAT_MODE=openai`
   - `CONTACT_MODE=smtp`
   - `CONTACT_EMAIL_TO` — the address that should receive contact-form submissions
   - `SMTP_USER` — the Gmail account used to send (same address as above, or a dedicated sending account)
   - `SMTP_PASSWORD` — a Gmail [App Password](https://myaccount.google.com/apppasswords), **not** your regular account password
   - `CORS_ORIGINS=["https://your-site.vercel.app"]` — must match your actual Vercel production URL (and any preview/custom domains you want to allow)
4. Deploy. Confirm it's healthy by visiting `https://<your-render-app>.onrender.com/api/health` — expect `"status": "ok"`.

**Note on Render's free tier:** the service spins down after a period of inactivity, so the first request after idle can take 30–60 seconds while it wakes up. The chatbot widget will show "Offline"/"Checking" during this window.

### Frontend → Vercel

1. Import this repo into Vercel and set the project root directory to `frontend`.
2. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
3. Set the environment variable:
   - `VITE_API_BASE_URL` = your Render backend URL, e.g. `https://<your-render-app>.onrender.com`
4. Deploy. Once live, verify:
   - The portfolio loads (this is now a same-origin static fetch of `/content/websitecontent.md` served by Vercel itself — it does **not** depend on the backend being reachable).
   - The chatbot status pill shows "Live" (confirms `/api/health` is reachable and CORS is correct for the chat/health routes).
   - Submitting a test message through the contact form succeeds (confirms `/api/contact` + SMTP are working).

### Redeploying after content or code changes

- `chatcontent.md` changes: pushing to the connected branch triggers a Render redeploy automatically (if auto-deploy is enabled).
- `websitecontent.md` or any frontend code changes: pushing to the connected branch triggers a Vercel redeploy automatically.

---

## API endpoints

All routes are prefixed with `/api`.

| Method | Path | Description | Rate limited |
|---|---|---|---|
| `GET` | `/api/health` | Backend, chat-content, and OpenAI-config status | No |
| `POST` | `/api/chat` | Chatbot Q&A, answers only from `chatcontent.md` | Yes (`CHAT_RATE_LIMIT`/min, default 10) |
| `POST` | `/api/contact` | Contact form submission, sends an email | Yes (`CONTACT_RATE_LIMIT`/min, default 5) |

The website's own content is **not** served by the backend — it's a static file (`frontend/public/content/websitecontent.md`) fetched and parsed directly by the browser.

Interactive API docs (Swagger UI) are available at `/docs` on any running backend instance (local or deployed).

---

## Error handling

**Backend**

- Input validation (missing/malformed fields, over-length messages, invalid email) is rejected by Pydantic with `422`.
- Expected failures raise a typed exception in the service layer and are mapped to a clean HTTP response by the route: empty chat message / missing config → `400`, OpenAI provider failure → `503` (`ChatServiceError`), email delivery failure → `503` (`EmailServiceError`).
- Any other, truly unexpected exception is caught by an app-wide handler (`app/main.py`) and returned as `500 {"detail": "Internal server error"}` — the client never sees a raw stack trace, and the full traceback is logged server-side instead.

**Frontend**

- All backend calls go through a shared `apiRequest` helper (`src/services/api.ts`) that: applies a 15s request timeout, turns network failures into "Unable to reach the server", turns timeouts into "The request timed out", and turns non-JSON responses (e.g. a platform error page instead of an API response) into a readable fallback message instead of letting a JSON-parse error propagate raw. `services/portfolio.ts` applies the same network/parse-failure handling to the local `websitecontent.md` fetch.
- `App.tsx` shows a dedicated error state with a **Retry** button if the initial portfolio load fails.
- `ChatbotWidget` and `ContactForm` catch request failures locally and show an inline error message without losing what the user typed.
- A top-level `ErrorBoundary` (wrapping `<App />` in `main.tsx`) catches unexpected render-time errors anywhere in the tree and shows a "Something went wrong" screen with a reload button, instead of a blank page.

---

## Repo layout

```
backend/    FastAPI app, chatbot knowledge (chatcontent.md), chatbot + email services, pytest suite
frontend/   React + Vite portfolio UI (websitecontent.md, parsed client-side),
            always-visible chatbot sidebar, contact form
```

See [DOCUMENTATION.md](DOCUMENTATION.md) for the full architecture breakdown, per-file responsibilities, and known limitations.
