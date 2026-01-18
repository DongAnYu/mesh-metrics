# Mesh Metrics — Local Development Guide

This repository contains:
- **Frontend**: React (Vite) — Node.js / npm
- **Backend**: FastAPI — Python with `uv`

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.12
- **uv** (Python package manager)

```bash
pip install uv
```

---

## Frontend (React / Vite)

### Setup & Run

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at:

```
http://localhost:5173
```

---

## Backend (FastAPI / uv)

> **Important:** Do NOT mix `pip` with `uv`.
> Always use `uv venv`, `uv pip`, and `uv run`.

### Setup

```bash
cd backend
uv venv .venv
.venv\\Scripts\\activate   # Windows
```

### Install dependencies

```bash
uv pip install -r requirements.txt
```

### Run backend

```bash
uv run uvicorn main:app --reload
```

Backend will be available at:

```
http://localhost:8000
```

API docs:

```
http://localhost:8000/docs
```

---

## Common Pitfalls

- ❌ Do NOT run `pip install`
- ❌ Do NOT run bare `uvicorn`
- ❌ Do NOT mix `uv pip` and `pip`

Correct pattern:

```text
uv venv → uv pip → uv run
```

---

## Project Structure

```text
mesh-metrics/
├── frontend/      # React (Vite)
└── backend/       # FastAPI (uv)
```

---

## Notes

- Backend auto-detects frontend environment (local vs production)
- CORS is open for local development
- STL alignment & similarity are computed server-side

---

## Deployment Website:
https://mesh-metrics.vercel.app/
Alignment and similarity computation is slower due to backend server is currently in a free tier (limited cpu)
