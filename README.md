<h1 align="center">Mesh Metrics — STL Similarity & Visual Comparison</h1>

<div align="center">
  <img src="https://img.shields.io/badge/STATUS-IN%20DEVELOPMENT-yellow?style=for-the-badge" alt="Status: In Development" />
  <img src="https://img.shields.io/badge/FRONTEND-REACT-blue?style=for-the-badge" alt="Frontend: React" />
  <img src="https://img.shields.io/badge/BACKEND-FASTAPI%20%2B%20PYTHON%20%2B%20UV-green?style=for-the-badge" alt="Backend: FastAPI + Python + uv" />
</div>

---

## 🌍 The Problem

Engineering teams still rely heavily on manual STL inspection and subjective visual comparison when validating CAD outputs, simulation results, or generative AI models.

That creates three major problems:

- ⏱️ Slow validation workflows for large-scale CAD pipelines
- 👁️ Human bias in geometric similarity assessment
- 🔧 No intuitive way to visually inspect alignment and surface deviation in real time

As AI-generated CAD and digital manufacturing scale, engineers need a faster and more objective way to compare 3D geometry.

## 💡 The Solution

Mesh Metrics is an STL similarity and visual comparison platform for 3D engineering models.

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.12
- **uv** (Python package manager)

```bash
pip install uv
```

---

## Frontend (React)

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

## Notes

- Backend auto-detects frontend environment (local vs production)
- CORS is open for local development
- STL alignment & similarity are computed server-side

---

## Deployment Website:
https://mesh-metrics.vercel.app/
Alignment and similarity computation is slower due to backend server is currently in a free tier (limited cpu)

---

## 🤝 Contributing

This project is in active development. If you're passionate about accessibility, AI, or just want to help — PRs are welcome!
