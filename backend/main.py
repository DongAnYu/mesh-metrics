from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import json
from fastapi import UploadFile, File
from io import BytesIO
import trimesh
from similarity_engine import compute_similarity
from alignment_engine import compute_alignment 

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
    weights: str = Form(None),
    sharpness: str = Form(None)
):
    user_weights = None
    if weights:
        user_weights = json.loads(weights)

    user_sharpness = None
    if sharpness:
        user_sharpness = json.loads(sharpness)

    try:
        sim = compute_similarity(
        await fileA.read(),
        await fileB.read(),
        user_weights,
        user_sharpness  
    )
        return sim

    except ValueError as e:
        # frontend weight error → clean message
        return { "error": str(e) }
    
@app.post("/align")
async def align(
    fileA: UploadFile = File(...),
    fileB: UploadFile = File(...),
):
    try:
        # Load STL bytes
        bytesA = await fileA.read()
        bytesB = await fileB.read()

        meshA = trimesh.load(BytesIO(bytesA), file_type="stl")
        meshB = trimesh.load(BytesIO(bytesB), file_type="stl")

        # Compute centroid-based alignment
        result = compute_alignment(meshA, meshB)

        return {
            "status": "ok",
            "transform": result["transform"],
            "centroidA": result["centroidA"],
            "centroidB": result["centroidB"],
            "type": result["type"],
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
        }