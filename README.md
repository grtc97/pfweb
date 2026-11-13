# Portfolio website

Personal portfolio website with a Python + FastAPI backend chatbot and a React + Vite frontend.

- **Frontend (Vercel):** React + Vite. Loads and parses its own bundled portfolio content (no backend call needed) and renders an always-visible AI chatbot sidebar plus a contact form.
- **Backend (Render):** FastAPI. Serves a chat API (backed by its own separate content file), a contact/email API, and health checks.
- **OpenAI:** Used only on the backend. The frontend never calls OpenAI directly.
- **Content:** the website's content and the chatbot's knowledge are two independent markdown files.

---

## Repo layout

```
backend/    FastAPI app, chatbot knowledge (chat content), chatbot + email services, pytest suite
frontend/   React + Vite portfolio UI (website content, parsed client-side),
            always-visible chatbot sidebar, contact form
```
