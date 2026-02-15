from fastapi import FastAPI, File, UploadFile, Form, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import json
from fastapi import UploadFile, File
from io import BytesIO
import trimesh
from similarity_engine import compute_similarity
from alignment_engine import compute_alignment
from utils import execute_cadquery_script 

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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

        print(f"🎯 Alignment result keys: {result.keys()}")
        print(f"🎯 Worst discrepancy point: {result.get('worstDiscrepancyPoint')}")
        print(f"🎯 Threshold info: {result.get('thresholdDistance'):.6f} ({result.get('thresholdFraction')*100:.1f}% of {result.get('diagonal'):.6f})")
        print(f"🎯 Total discrepancy points: {len(result.get('discrepancyPoints', []))}")

        return {
            "status": "ok",
            "transform": result["transform"],
            "centroidA": result["centroidA"],
            "centroidB": result["centroidB"],
            "type": result["type"],
            "worstDiscrepancyPoint": result.get("worstDiscrepancyPoint"),
            "worstDiscrepancyPointMeshB": result.get("worstDiscrepancyPointMeshB"),
            "discrepancyPoints": result.get("discrepancyPoints", []),
            "diagonal": result.get("diagonal"),
            "thresholdDistance": result.get("thresholdDistance"),
            "thresholdFraction": result.get("thresholdFraction"),
        }

    except Exception as e:
        print(f"❌ ERROR in /align endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e),
            }
        )


@app.post("/cadquery")
async def cadquery_execute(payload: dict = Body(...)):
    """
    Execute CadQuery code and return STL file bytes.
    Expects JSON body: { "code": "import cadquery as cq\nresult = ..." }
    """
    print("\n" + "="*60)
    print("🔧 /cadquery endpoint called")
    print("="*60)
    
    try:
        print(f"📦 Received payload: {payload}")
        code = payload.get("code", "")
        
        if not code:
            print("❌ No code provided in payload")
            return JSONResponse(
                status_code=400,
                content={"error": "No code provided", "message": "No code provided"}
            )
        
        print(f"✅ Code received, length: {len(code)} characters")
        print(f"📝 Code preview:\n{code[:200]}...")
        
        # Execute CadQuery script and get STL bytes
        print("🚀 Starting CadQuery execution...")
        stl_bytes = execute_cadquery_script(code)
        
        print(f"✅ STL generated successfully, size: {len(stl_bytes)} bytes")
        
        # Return as STL file
        return Response(
            content=stl_bytes,
            media_type="model/stl",
            headers={
                "Content-Disposition": "attachment; filename=cadquery_result.stl"
            }
        )
    
    except Exception as e:
        print(f"❌ ERROR in /cadquery endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e),
            }
        )