# webpf — Project Documentation

Personal portfolio website with an AI chatbot, built as a decoupled frontend/backend app.

- **Frontend:** React 18 + TypeScript + Vite → deployed on **Vercel** (free tier)
- **Backend:** Python + FastAPI → deployed on **Render** (free tier)
- **AI:** OpenAI Chat Completions API (`gpt-4o-mini` by default), backend-only — the frontend never talks to OpenAI directly
- **Email:** Gmail SMTP for the contact form

This document describes the architecture, request flows, API contract, configuration, and known limitations. For setup/run/deploy/test commands, see [README.md](README.md).

---

## 1. High-level architecture

```
┌───────────────────────┐         HTTPS/JSON          ┌──────────────────────────┐
│   Frontend (Vercel)    │ ───────────────────────────▶│    Backend (Render)      │
│   React + Vite         │◀─────────────────────────── │    FastAPI               │
│                         │                              │                          │
│  - Portfolio UI         │                              │  - /api/chat  ──▶ OpenAI │
│    (parses its own      │                              │  - /api/contact ─▶ SMTP  │
│     bundled markdown,   │                              │  - /api/health           │
│     no backend call)    │                              └──────────────────────────┘
│  - ChatbotWidget         │                                          │
│  - ContactForm            │                                          ▼
└───────────────────────┘                              backend/app/content/chatcontent.md
             │                                          (chat-only — injected into the
             ▼                                           OpenAI system prompt)
frontend/public/content/websitecontent.md
(website-only — fetched + parsed client-side,
 completely independent of chatcontent.md)
```

Key design decision: **the website's content and the chatbot's knowledge are two independent files**, each editable without touching the other:

- `backend/app/content/chatcontent.md` — raw markdown injected into the OpenAI system prompt. Backend-only; nothing else reads it.
- `frontend/public/content/websitecontent.md` — fetched by the browser at runtime and parsed client-side (`services/portfolioParser.ts`) into the structured data the portfolio UI renders. Frontend-only; the backend never touches it.

They start as copies of each other but are expected to diverge over time (e.g. you might want the chatbot to know more detail than the website displays, or vice versa).

This split exists because **Render and Vercel are separate deployments with separate root directories** (`rootDir: backend` / `rootDir: frontend` respectively) — in production, the backend process has no filesystem access to anything under `frontend/`, and the frontend is a static build with no backend process behind its own content. There used to be a single `portfolio.md` parsed server-side and served as JSON via `GET /api/portfolio`; that endpoint has been removed along with the backend-side structured parser, since the frontend now loads and parses its own copy directly and no longer calls the backend for portfolio data at all.

---

## 2. Repository layout

```
backend/
  app/
    main.py                    # FastAPI app, middleware, router registration, global error handler
    core/
      config.py                # Pydantic Settings (env vars), BACKEND_ROOT path
    api/routes/
      health.py                # GET  /api/health
      chat.py                  # POST /api/chat   (rate limited)
      contact.py                # POST /api/contact (rate limited)
    schemas/                   # Pydantic request/response models
      chat.py
      contact.py
    services/
      chat_content_service.py  # loads chatcontent.md (raw text only, for the chat prompt)
      openai_service.py        # builds prompt, calls OpenAI, mock mode, ChatServiceError
      email_service.py         # sends contact-form email via SMTP, mock mode, EmailServiceError
    content/
      chatcontent.md            # chatbot-only knowledge base (NOT used by the website)
  tests/
    test_api.py                 # endpoint tests: health, chat, contact,
                                 # validation errors, 503/500 error-handling paths
    test_email_service.py       # SMTP/mock email service unit tests incl. error translation
    test_openai_service.py      # chat service unit tests incl. OpenAI-error translation
  requirements.txt
  pytest.ini                    # pytest-asyncio config (strict mode, function-scoped loop)
  render.yaml                  # Render deployment config (Blueprint)
  .env.example

frontend/
  public/
    content/
      websitecontent.md         # website-only content (NOT used by the chatbot); bundled as a
                                 # static asset, fetched by the browser at runtime
  src/
    App.tsx                     # page layout: portfolio sections + sidebar chatbot; retry on load failure
    components/
      ChatbotWidget.tsx         # chat UI, backend health pill, suggested prompts
      ContactForm.tsx           # contact form UI
      ErrorBoundary.tsx         # top-level React error boundary (render-time crash fallback)
      *.test.tsx                # component tests, co-located with each component
    services/
      portfolio.ts              # fetches websitecontent.md and parses it (loadPortfolio)
      portfolioParser.ts         # markdown -> Portfolio structured parser (TS port of the
                                  # original backend parser)
      portfolioParser.test.ts
      fixtures/samplePortfolio.md
      api.ts                    # fetch wrappers for backend endpoints (chat, contact, health)
      api.test.ts
      portfolio.test.ts
    test/setup.ts               # Vitest setup: jest-dom matchers, RTL cleanup, scrollIntoView polyfill
    types/portfolio.ts          # Portfolio type (parsed client-side) + types mirroring backend schemas
    styles.css                  # all styling (no CSS framework)
    main.tsx                    # React entrypoint, wraps <App /> in <ErrorBoundary />
    App.test.tsx
  index.html                    # SEO/OG/Twitter meta tags
  vercel.json                   # SPA rewrite rule (all routes -> index.html); doesn't intercept
                                 # /content/websitecontent.md since it's a real static file and
                                 # Vercel serves existing files before applying rewrites
  vite.config.ts                # includes Vitest `test` config (jsdom environment)
  package.json
  .env.example
```

---

## 3. Backend details

### 3.1 App composition (`app/main.py`)

- FastAPI app with 3 routers mounted under `/api`: `health`, `chat`, `contact`.
- CORS is restricted to `settings.cors_origins` (a list, configured via env var).
- Rate limiting via `slowapi`, keyed by remote IP (`get_remote_address`). Chat and contact each have independent limiter instances/limits.
- A single `GET /` root route returns a plain liveness message (not part of the `/api` surface, useful for confirming the Render service itself is up).

### 3.2 Configuration (`app/core/config.py`)

Uses `pydantic-settings.BaseSettings`, loaded from a `.env` file at `backend/.env` (see `BACKEND_ROOT` resolution) with `extra="ignore"`. Settings are cached via `@lru_cache` (`get_settings()`) and exposed as the module-level `settings` singleton.

| Setting | Default | Purpose |
|---|---|---|
| `openai_api_key` | `""` | OpenAI key. Required if `chat_mode=openai`. |
| `openai_model` | `gpt-4o-mini` | Chat model. |
| `chat_mode` | `openai` | `openai` or `mock`. Mock mode echoes back canned text without calling OpenAI — used for local dev / tests / demoing without burning API credits. |
| `chat_rate_limit` | `10` | Requests/minute per IP for `/api/chat` (1–100). |
| `contact_mode` | `mock` | `smtp` or `mock`. Mock mode no-ops (used in tests/local dev). |
| `contact_email_to` | `ganesh.rakate27@gmail.com` | Where contact-form submissions are delivered. |
| `contact_rate_limit` | `5` | Requests/minute per IP for `/api/contact` (1–30). |
| `smtp_host` / `smtp_port` | `smtp.gmail.com` / `587` | Gmail SMTP endpoint (STARTTLS). |
| `smtp_user` / `smtp_password` | `""` | Gmail account + **App Password** (not the account password) used to send. |
| `chat_content_path` | `app/content/chatcontent.md` | Relative (to `BACKEND_ROOT`) or absolute path to the chatbot's knowledge-base markdown. |
| `cors_origins` | `localhost:5173/5174/5175/3000` | Allowed frontend origins. **Must include the production Vercel URL in deployment.** |

### 3.3 Chat content pipeline (backend, chat-only)

- `chat_content_service.load_chat_content()` reads `chatcontent.md` as a raw string (empty string if missing) — **no parsing, no caching, no structured model.** It's re-read from disk on every chat request, which is fine since it's a small local file and there's no hot path concern.
- This raw text is injected directly into the OpenAI system prompt (`openai_service._build_system_content`) — the chatbot always answers from the current contents of `chatcontent.md`, no restart required to pick up wording tweaks (unlike the old cached-portfolio behavior).
- There is intentionally no markdown *structure* parsing on the backend anymore — the chatbot only ever needs the plain text, not a `Portfolio` object.

### 3.4 Chat (`/api/chat`)

- `openai_service.generate_chat_response(message, history)`:
  - Validates the message is non-empty.
  - In `mock` mode: returns a canned string confirming receipt (no OpenAI call).
  - In `openai` mode: builds a system prompt (`SYSTEM_PROMPT` + `chatcontent.md`) instructing the model to **answer only from that content**, refuse to invent facts, and stay concise. Appends up to the last 10 turns of `history` plus the new user message, then calls `AsyncOpenAI().chat.completions.create(...)` with `temperature=0.3`, `max_tokens=500`.
  - Wraps the OpenAI call in `try/except OpenAIError`, translating any provider failure (timeout, connection error, rate limit, bad status) into a `ChatServiceError`.
  - Raises `ValueError` for empty message / missing API key → mapped to HTTP `400` by the route. Raises `ChatServiceError` for provider failures → mapped to HTTP `503` with a user-facing "temporarily unavailable" message. Anything else unexpected falls through to the app-wide handler → HTTP `500`.
- Request/response validated by `schemas/chat.py`: message capped at 4000 chars, history capped at 20 messages of ≤4000 chars each, roles restricted to `user`/`assistant`.

### 3.5 Contact form (`/api/contact`)

- `email_service.send_contact_email(...)`:
  - `mock` mode: no-op (returns immediately, used in tests/local dev).
  - `smtp` mode: requires `smtp_user`/`smtp_password` (raises `ValueError` → HTTP `400` if missing); sends a plain-text email via `smtplib` + STARTTLS to `contact_email_to`, with `Reply-To` set to the visitor's email so replying goes straight to them.
  - The `smtplib.SMTP` call is wrapped in `try/except`: an `SMTPAuthenticationError` becomes `EmailServiceError("Email delivery is misconfigured on the server.")`; any other `SMTPException`/`OSError`/timeout becomes `EmailServiceError("Unable to send your message right now...")`. The route maps `EmailServiceError` → HTTP `503`.
- Validated by `schemas/contact.py` (`EmailStr` for email, length limits on other fields). Reuses the `chat.py` limiter instance for shared `slowapi` state, with its own per-route rate (`contact_rate_limit`).

### 3.6 Health (`/api/health`)

Returns `status: ok|degraded` based on whether `chatcontent.md` loaded successfully and whether OpenAI is configured (or mock mode is active). Response fields: `status`, `chat_mode`, `chat_content_loaded`, `chat_content_file_exists`, `openai_configured` — this endpoint has nothing to do with the website's own content anymore, only the chatbot's. The frontend `ChatbotWidget` pings this on mount to show a Live/Limited/Offline status pill, and treats a fetch failure as `offline` (e.g. Render free-tier cold start).

### 3.7 App-wide error handling (`app/main.py`)

A handler registered for the base `Exception` class catches anything not already handled by a route (a bug, an unexpected library error, a malfunctioning dependency), logs the full traceback server-side via the standard `logging` module, and returns a generic `500 {"detail": "Internal server error"}` JSON body. This matters because Starlette's *default* unhandled-exception response is plain text, not JSON — without this handler, a truly unexpected backend error would return a non-JSON body that the frontend's `response.json()` call can't parse, surfacing a confusing client-side error instead of a clean message. Verified in `tests/test_api.py::test_unhandled_exception_returns_json_error` (using `TestClient(app, raise_server_exceptions=False)`, since `TestClient` re-raises unhandled exceptions by default for debugging — a real client would only ever see the JSON response).

---

## 4. Frontend details

### 4.1 Layout (`App.tsx`)

Single-page app: loads the portfolio via `services/portfolio.ts` on mount (a same-origin fetch of the bundled `websitecontent.md`, not a backend call), renders a loading state, an error state (with a **Retry** button), or the full page. Desktop layout is a two-column grid — portfolio content in `<main>`, an always-visible `ChatbotWidget` in a `<aside>` sidebar (deliberately always visible, not a launcher bubble, to encourage engagement per `frontend/README.md`).

### 4.2 `services/portfolio.ts` + `services/portfolioParser.ts`

- `portfolio.ts` exports `loadPortfolio()`: fetches `/content/websitecontent.md` (served from `public/`, bundled into the Vercel static build), and parses the response text with `parsePortfolioMarkdown`. Translates a network failure or a missing file into a friendly error message, same pattern as the backend-call error handling in `api.ts`.
- `portfolioParser.ts` is a direct TypeScript port of the original backend markdown parser (Python's `portfolio_parser.py`, now removed from the backend): the same section-splitting (`# Section` headers), the same `## ` sub-header chunking for experience/education/projects, the same bullet (`•`/`-`) and years-regex handling. Kept in lockstep by design — if you need to change how the content markdown is structured, check both `portfolioParser.ts` and its tests, since there's no shared parser between languages.
- Covered by `portfolioParser.test.ts` (against a fixture, and against the real bundled `websitecontent.md`) and `portfolio.test.ts` (fetch success/failure/parse-failure, mocking `global.fetch`).

### 4.3 `services/api.ts`

The 3 remaining backend calls (`sendChatMessage`, `sendContactMessage`, `pingBackend`) go through one shared `apiRequest<T>()` helper, which:

- Applies a 15s timeout via `AbortController`, translating an abort into `"The request timed out. Please try again."`
- Catches `fetch` network failures (DNS/connection errors, offline) and translates them into `"Unable to reach the server. Please check your connection and try again."`
- Wraps `response.json()` in its own `try/catch`: if a non-`ok` response isn't valid JSON (e.g. a platform's HTML error page instead of the API's JSON), it falls back to the caller's default message rather than throwing a raw `SyntaxError`; if an `ok` response isn't valid JSON, it surfaces `"Received an unexpected response from the server."`
- On a JSON error response, surfaces FastAPI's `detail` field via `formatApiError` — handling both a plain string and a Pydantic validation-error array (joined into one readable message).

Base URL comes from `VITE_API_BASE_URL`, defaulting to `http://127.0.0.1:8000`. Covered by `services/api.test.ts`.

### 4.4 `ChatbotWidget.tsx`

Client-side chat state (no persistence — resets on page reload). Sends the running message history with each request (server also caps it to the last 10). Includes suggested-prompt chips, `Enter`-to-send (Shift+Enter for newline), and the backend status pill described above. A failed `sendChatMessage` call is caught locally, shown as an assistant-bubble error message, and flips the status pill to Offline.

### 4.5 `ContactForm.tsx`

Controlled form with client-side "all fields non-empty" gating (`canSubmit`), calls `sendContactMessage`, shows inline success/error feedback, clears the form on success. On failure, the entered values are preserved (only cleared on success) so the visitor doesn't have to retype their message.

### 4.6 `ErrorBoundary.tsx`

A class-based React error boundary (function components can't catch render errors) wrapping `<App />` in `main.tsx`. If any component throws during render — a bad content shape, a null-reference bug, anything — it shows a "Something went wrong" screen with a reload button instead of an unrecoverable blank page. `componentDidCatch` logs the error and component stack to the console for debugging.

### 4.7 Types (`types/portfolio.ts`)

`Portfolio` and its nested types are now the contract between `portfolioParser.ts` and the UI components — no longer a mirror of a backend Pydantic schema, since there's no backend portfolio schema anymore. `HealthResponse`, `ChatMessage`, `ChatResponse`, `ContactMessage`, `ContactResponse` still mirror the backend's `schemas/chat.py` / `schemas/contact.py` / health response shape by hand — **there is no shared codegen** between backend and frontend for those, so a backend schema change still needs a manual update here (see §7, Known limitations).

### 4.8 Frontend tests

Vitest + React Testing Library, configured in `vite.config.ts` (`test.environment: 'jsdom'`) with `src/test/setup.ts` providing `jest-dom` matchers, an explicit React Testing Library `cleanup()` in `afterEach` (needed because the project doesn't use Vitest's `globals: true`, so RTL's automatic-cleanup detection doesn't fire on its own), and a `scrollIntoView` polyfill (jsdom doesn't implement it, and `ChatbotWidget` calls it to auto-scroll new messages into view). 26 tests across 7 files — see the README's Tests section for what each file covers. Run with `npm test` (single run) or `npm run test:watch`.

---

## 5. Data flow: editing content

The website and the chatbot are edited **independently** now — pick the right file for what you're changing:

### Editing what the chatbot knows

1. Edit `backend/app/content/chatcontent.md`.
2. Redeploy the backend (Render) — or just restart it locally. Unlike the old cached-portfolio setup, this file is read fresh on every chat request, so no in-process cache to worry about; a restart/redeploy is only needed because that's how the file reaches the running server at all.
3. No structure requirements beyond being readable plain text — the whole file is dropped into the system prompt as-is. There's no parser to satisfy on this side.

### Editing what the website displays

1. Edit `frontend/public/content/websitecontent.md` (structure: `## Name:`/`Title:`/`Location:` header block, then `# Summary`, `# Technical Skills`, `# Experience`, `# Education`, `# Projects`, `# Honors-Awards`, `# Contact` sections — see the file itself and `frontend/src/services/fixtures/samplePortfolio.md` for the exact expected format).
2. Redeploy the frontend (Vercel) — it's bundled as a static asset at build time, so a local `npm run dev` picks up changes on save, but production needs a redeploy.
3. Run `npm test -- portfolioParser` after structural edits to catch parsing regressions early.

Since these are two separate files, keeping them roughly in sync (when that's desired) is a manual, deliberate choice — there's no longer a "single source of truth" step that updates both at once.

---

## 6. Current state / in-progress work

As of this writing, the working tree has **uncommitted changes** on top of the initial commit. Nothing described in this document is deployed yet:

- The contact-form feature, error-handling hardening on both sides, and the backend + frontend test suites (built in an earlier round of changes).
- The content-source split covered in this document: `backend/app/content/portfolio.md` → `chatcontent.md` (backend-only, chat-only), plus a new `frontend/public/content/websitecontent.md` (frontend-only, website-only) parsed client-side by a new `portfolioParser.ts`. The backend's `/api/portfolio` endpoint, `portfolio_service.py`, `portfolio_parser.py`, and `schemas/portfolio.py` were removed as a consequence — they had no remaining purpose once the frontend stopped calling that endpoint.

This means: locally the app is fully functional with independently-editable website/chat content — but **the deployed Vercel/Render instances still reflect the old single-`portfolio.md` architecture**. It only ships once committed and deployed (see §8 next steps).

---

## 7. Known limitations / things to be aware of

- **Two content files can drift silently.** `chatcontent.md` and `websitecontent.md` started as copies but nothing keeps them in sync — the chatbot could end up knowing about a project the website doesn't show, or vice versa. That's the intended tradeoff for independent editing, but worth remembering when updating one and forgetting the other.
- **The parser logic is duplicated in two languages.** `frontend/src/services/portfolioParser.ts` is a manual TypeScript port of the original Python parser (now deleted from the backend). If `websitecontent.md`'s structure needs to change, only the TS parser matters now — but if anyone ever reintroduces backend-side portfolio parsing, the two would need to be kept in sync by hand.
- **Render free-tier cold starts:** the backend spins down after inactivity; the first request after idle can take 30–60s. This now only affects the chatbot and contact form (status pill shows "Offline"/"Checking") — the portfolio page itself no longer depends on the backend being awake at all, since it's a static fetch from Vercel's own CDN.
- **No persistent chat history:** conversations reset on page reload; nothing is stored server-side.
- **Manually duplicated types:** the backend's chat/contact/health Pydantic schemas and the frontend's corresponding TS types are kept in sync by hand.
- **No CI pipeline:** no GitHub Actions (or similar) currently runs tests/lint on push or PR — both test suites (`pytest`, `npm test`) must be run manually before deploying.
- **Secrets via `sync: false` in `render.yaml`:** `OPENAI_API_KEY`, `SMTP_USER`, `SMTP_PASSWORD`, `CORS_ORIGINS` must be set manually in the Render dashboard; they are not stored in the repo (correctly) but also not auto-provisioned by the blueprint.
- **Rate limiting is per-process, in-memory** (`slowapi` default backend): on Render's free tier there's a single instance so this is fine, but it would not work correctly across multiple instances without a shared store (e.g. Redis). No automated test exercises an actual 429 response, since that would require sending more requests than the per-minute limit within a single test run.
- **`ErrorBoundary` only catches render-time errors**, not errors in event handlers or async code (a React limitation, not specific to this app) — those are instead handled locally by each component's own `try/catch` around its API calls.

---

## 8. Suggested next steps

1. **Commit and deploy everything currently uncommitted** — the contact form, error-handling hardening, both test suites, and the content-source split are all fully built and passing locally but not yet live. Review the diff, run both test suites, then commit and push.
2. **Decide whether `chatcontent.md` and `websitecontent.md` should ever diverge on purpose**, and if not, consider a lightweight guard (e.g. a CI check or a comment at the top of each file) reminding future-you to update both when making a routine content edit.
3. **Set up CI** (GitHub Actions): run `pytest` (backend) and `npm test` + `npm run build` (frontend) on every push/PR, so regressions are caught before deploying.
4. **Mitigate Render cold starts** — either an uptime ping (e.g. a free monitor like UptimeRobot hitting `/api/health` every few minutes) or a friendlier "waking up the backend..." UI state instead of "Offline" (this now only affects chat/contact, not the portfolio page itself).
5. **Verify production `CORS_ORIGINS` and `VITE_API_BASE_URL`** are set correctly in Render/Vercel dashboards after the domain is finalized (custom domain vs `*.vercel.app`).
6. **Rotate/secure the Gmail App Password** periodically, and confirm `backend/.env` is never committed (already correctly gitignored — just a standing reminder).
