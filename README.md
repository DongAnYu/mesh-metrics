<div align="center">

# Mesh Metrics

### STL Similarity & Visual Comparison Tool

[![Status](https://img.shields.io/badge/STATUS-IN%20DEVELOPMENT-yellow?style=for-the-badge)](https://github.com)
[![Frontend](https://img.shields.io/badge/FRONTEND-REACT-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Backend](https://img.shields.io/badge/BACKEND-FASTAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/PYTHON-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Docker](https://img.shields.io/badge/DOCKER-READY-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)

**Upload. Align. Compare. Measure.**

[🌐 Live Demo](https://dong-an-yu-portfolio.up.railway.app/#projects) · [📖 API Docs](http://localhost:8000/docs) · [🐛 Report Bug](https://github.com/DongAnYu/mesh-metrics/issues) · [💡 Request Feature](https://github.com/DongAnYu/mesh-metrics/issues)

</div>

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [The Solution](#-the-solution)
- [Features](#-features)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Deployment](#-deployment)
  - [1. Traditional (Local Dev)](#1-traditional-local-development)
  - [2. Docker (Manual)](#2-docker-manual)
  - [3. Docker Compose](#3-docker-compose)
  - [4. Kubernetes](#4-kubernetes)
- [Configuration](#-configuration)
- [Contributing](#-contributing)

---

## 🌍 The Problem

Engineering teams still rely heavily on manual STL inspection and subjective visual comparison when validating CAD outputs, simulation results, or generative AI models.

That creates three major problems:

| Problem | Impact |
|---|---|
| ⏱️ **Slow validation** | Manual inspection bottlenecks large-scale CAD pipelines |
| 👁️ **Human bias** | Subjective geometric similarity assessment leads to inconsistency |
| 🔧 **No real-time tooling** | No intuitive way to inspect alignment and surface deviation live |

As AI-generated CAD and digital manufacturing scale, engineers need a faster and more objective way to compare 3D geometry.

---

## 💡 The Solution

**Mesh Metrics** is an STL similarity and visual comparison platform for 3D engineering models.

Upload two STL/STEP files, auto-align them via centroid + ICP registration, tune metric weights, and get an objective similarity score — all in the browser.

---

## ✨ Features

- 🔄 **Auto-alignment** — Centroid translation + multi-resolution rotation search + ICP refinement
- 📐 **Multi-metric scoring** — Chamfer distance, volume, surface area, bounding box, max deviation
- 🎛️ **Configurable weights & strictness** — Tune scoring to your engineering tolerances
- 👁️ **3D visual comparison** — Side-by-side viewer with discrepancy highlighting
- 💻 **CadQuery support** — Generate models directly from Python code
- 📦 **STEP & STL** — Supports both common CAD formats

---

## 🏗️ Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│   React Frontend    │◄──────►│    FastAPI Backend        │
│   (Vite + Three.js) │  HTTP  │  (Python + trimesh + cq)  │
│   Port 3000 / 80    │        │       Port 8000            │
└─────────────────────┘        └──────────────────────────┘
```

**Backend endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/compare` | Compute similarity between two meshes |
| `POST` | `/align` | Auto-align two meshes, return transform |
| `POST` | `/mesh/prepare` | Convert/clean STL or STEP for viewer |
| `POST` | `/cadquery` | Execute CadQuery code, return STL |

---

## 🔧 Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Python | ≥ 3.12 | [python.org](https://python.org) |
| uv | latest | `pip install uv` |
| Docker | ≥ 24 *(optional)* | [docker.com](https://docker.com) |
| kubectl | ≥ 1.28 *(optional)* | [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |

---

## 🚀 Deployment

### 1. Traditional (Local Development)

Run the frontend and backend directly on your machine — best for active development.

#### Backend

```bash
cd backend

# Create and activate virtual environment
uv venv .venv
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate           # Windows

# Install dependencies
uv pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set PORT=8000

# Start the server
uv run uvicorn main:app --reload
```

Backend available at → `http://localhost:8000`
API docs at → `http://localhost:8000/docs`

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set VITE_API_URL=http://localhost:8000

# Start dev server
npm run dev
```

Frontend available at → `http://localhost:5173`

---

### 2. Docker (Manual)

Build and run each service as a standalone Docker container using the Dockerfiles already in the repo. Useful when you want fine-grained control over individual services.

**Dockerfiles:** `backend/Dockerfile` · `frontend/Dockerfile`

#### Backend

```bash
# Build image using backend/Dockerfile
docker build -t mesh-metrics-backend ./backend

# Run container
docker run -d \
  --name mesh-metrics-backend \
  -p 8000:8000 \
  mesh-metrics-backend
```

#### Frontend

```bash
# Build image using frontend/Dockerfile
docker build -t mesh-metrics-frontend ./frontend

# Run container
docker run -d \
  --name mesh-metrics-frontend \
  -p 80:80 \
  -e VITE_API_URL=http://localhost:8000 \
  mesh-metrics-frontend
```

Frontend available at → `http://localhost:3000`
Backend available at → `http://localhost:8000`

---

### 3. Docker Compose

The recommended way to run both services together on a single machine. Uses the existing `docker-compose.yml` in the project root alongside `backend/Dockerfile` and `frontend/Dockerfile`.

**File:** `docker-compose.yml`

```bash
# Build and start all services
docker compose up --build

# Run in detached (background) mode
docker compose up --build -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# Rebuild a single service
docker compose up --build backend
```

Frontend available at → `http://localhost:80`
Backend available at → `http://localhost:8000`

---

### 4. Kubernetes

For production deployments with scaling, rolling updates, and high availability. Uses the same `backend/Dockerfile` and `frontend/Dockerfile` — build and push them to your registry, then apply the manifests.

> **Note:** Replace `<YOUR_REGISTRY>` with your container registry (e.g. `ghcr.io/yourorg`, `docker.io/yourusername`).

#### Step 1 — Build and push images

```bash
# Uses backend/Dockerfile
docker build -t <YOUR_REGISTRY>/mesh-metrics-backend:latest ./backend
docker push <YOUR_REGISTRY>/mesh-metrics-backend:latest

# Uses frontend/Dockerfile
docker build -t <YOUR_REGISTRY>/mesh-metrics-frontend:latest ./frontend
docker push <YOUR_REGISTRY>/mesh-metrics-frontend:latest
```

#### Step 2 — Apply manifests

**Files:** `k8s/backend-deployment.yaml` · `k8s/frontend-deployment.yaml` · `k8s/ingress.yaml` *(optional)*

```bash
# Create a namespace (optional but recommended)
kubectl create namespace mesh-metrics

# Apply all manifests
kubectl apply -f k8s/ -n mesh-metrics
```

#### Step 3 — Manage the deployment

```bash
# Check pod and service status
kubectl get pods -n mesh-metrics
kubectl get services -n mesh-metrics

# View logs
kubectl logs -f deployment/mesh-metrics-backend -n mesh-metrics

# Scale backend replicas
kubectl scale deployment mesh-metrics-backend --replicas=4 -n mesh-metrics

# Rolling update after pushing a new image
kubectl rollout restart deployment/mesh-metrics-backend -n mesh-metrics
kubectl rollout status deployment/mesh-metrics-backend -n mesh-metrics

# Tear down
kubectl delete -f k8s/ -n mesh-metrics
```

---

## ⚙️ Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port the FastAPI server listens on |

Key constants in `backend/config.py`:

| Constant | Default | Description |
|----------|---------|-------------|
| `DEFAULT_SHARPNESS` | `chamfer: 10, maxdist: 10` | Exponential decay sharpness for similarity scoring |
| `EVAL_SAMPLE_COUNT` | `20000` | Point samples used for final candidate evaluation |
| `NUM_ICP_STARTS` | `2` | Number of random ICP initializations |
| `DISCREPANCY_THRESHOLD_FRACTION` | `0.10` | Fraction of bounding diagonal to flag as discrepancy |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | Primary backend API URL |
| `VITE_FALLBACK_API_URL` | *(empty)* | Optional fallback backend URL |

---

## 🤝 Contributing

This project is in active development. PRs and issues are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 Notes

- Backend CORS is open (`*`) for local development — restrict origins in production
- STL alignment and similarity are computed server-side (CPU-intensive for large meshes)
- The hosted demo runs on a free-tier server — alignment will be slower than self-hosted
- STEP files are tessellated server-side before comparison

---

<div align="center">

[🌐 Live Demo](https://mesh-metrics.vercel.app/)

</div>
