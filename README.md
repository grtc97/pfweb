# webpf

Personal portfolio website with a React frontend and FastAPI backend chatbot.

## Architecture

- **Frontend (Vercel):** React + Vite. Loads portfolio content from the backend API.
- **Backend (Render):** FastAPI. Serves portfolio JSON, chat API, and health checks.
- **Content source of truth:** `backend/app/content/portfolio.md`
- **OpenAI:** Used only on the backend. The frontend never calls OpenAI directly.

## Local development

### Backend

```bash
source /home/ganesh/envt/genai/bin/activate
cd backend
cp .env.example .env
uvicorn app.main:app --reload
```

Set `CHAT_MODE=mock` in `.env` for local testing without OpenAI, or set `OPENAI_API_KEY` and `CHAT_MODE=openai`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend expects the backend at `http://127.0.0.1:8000` by default.

## API endpoints

- `GET /api/health` — backend and portfolio status
- `GET /api/portfolio` — structured portfolio content parsed from markdown
- `POST /api/chat` — chatbot endpoint (rate limited)

## Updating portfolio content

Edit `backend/app/content/portfolio.md`. Both the website and chatbot use this file.

After changing content locally, restart the backend to refresh the in-memory cache.

## Deployment

### Render (backend)

1. Connect the repo and set root directory to `backend`.
2. Set environment variables:
   - `OPENAI_API_KEY`
   - `CHAT_MODE=openai`
   - `CORS_ORIGINS=["https://your-site.vercel.app"]`
3. Deploy using `render.yaml`.

### Vercel (frontend)

1. Set root directory to `frontend`.
2. Set `VITE_API_BASE_URL` to your Render backend URL.
3. Build command: `npm run build`
4. Output directory: `dist`

## Tests

```bash
source /home/ganesh/envt/genai/bin/activate
cd backend
pytest
```

Requires `pytest` and `httpx` in your Python environment.

## Repo layout

- `backend/` — FastAPI app, portfolio markdown, chatbot service
- `frontend/` — React portfolio UI and always-visible chatbot panel
