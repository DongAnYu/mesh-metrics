from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import json
from similarity_engine import compute_similarity

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/compare")
async def compare(
    fileA: UploadFile = File(...),
    fileB: UploadFile = File(...),
    weights: str = Form(None)
):
    user_weights = None
    if weights:
        user_weights = json.loads(weights)

    try:
        sim = compute_similarity(
            await fileA.read(),
            await fileB.read(),
            user_weights
        )
        return sim

    except ValueError as e:
        # frontend weight error → clean message
        return { "error": str(e) }