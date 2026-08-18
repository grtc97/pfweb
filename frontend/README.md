# Frontend

React + Vite frontend for the webpf portfolio.

## Prerequisite

- Node.js 18+ with npm installed on your machine.
- Backend running at `http://127.0.0.1:8000` (only needed for the chatbot, contact form, and health status — the portfolio content itself is a static file bundled with the frontend and loads without the backend).

## Local setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Environment

- `VITE_API_BASE_URL` — backend URL (default: `http://127.0.0.1:8000`)

For production on Vercel, set `VITE_API_BASE_URL` to your Render backend URL.

## Layout

The portfolio content and chatbot panel are shown side by side in equal-width columns on desktop. The chatbot is always visible to encourage visitors to interact with it.
