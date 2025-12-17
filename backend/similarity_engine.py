from io import BytesIO
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from utils import safe_sample

# -------------------------------------------------
# Default Metric Weights (sum = 1.0)
# -------------------------------------------------
DEFAULT_WEIGHTS = {
    "chamfer": 0.50,
    "volume": 0.25,
    "area":   0.15,
    "bbox":   0.05,
    "maxdist":0.05,
}

# -------------------------------------------------
# Default Sharpness
# -------------------------------------------------
DEFAULT_SHARPNESS = {
    "chamfer": 10,
    "maxdist": 10
}

# -------------------------------------------------
# Validate incoming user weight dictionary 
# -------------------------------------------------
def validate_weights(weights):
    required = list(DEFAULT_WEIGHTS.keys())

    # ensure all keys exist
    for k in required:
        if k not in weights:
            raise ValueError(f"Missing weight: '{k}' (required keys: {required})")

    # ensure all values are numbers
    try:
        numeric_weights = {k: float(v) for k, v in weights.items()}
    except:
        raise ValueError("All weight values must be numeric.")

    # ensure sum = 1.0 (with epsilon tolerance)
    total = sum(numeric_weights.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"Weight sum must be exactly 1.0, but got {total}.")

    return numeric_weights

# -------------------------------------------------
# Validate incoming user sharpness dictionary 
# -------------------------------------------------
def validate_sharpness(sharpness):
    required = ["chamfer", "maxdist"]

    for k in required:
        if k not in sharpness:
            raise ValueError(f"Missing sharpness key: '{k}' (required: {required})")

    try:
        numeric_sharpness = {k: float(v) for k, v in sharpness.items()}
    except:
        raise ValueError("All sharpness values must be numeric.")

    return numeric_sharpness


# -------------------------------------------------
# Chamfer Distance
# -------------------------------------------------
def chamfer_distance(A, B):
    kdtA = cKDTree(A)
    kdtB = cKDTree(B)
    d1, _ = kdtA.query(B)
    d2, _ = kdtB.query(A)
    return float(np.mean(d1) + np.mean(d2)), float(max(np.max(d1), np.max(d2)))


# -------------------------------------------------
# Helper to get single mesh from Scene or Mesh
# -------------------------------------------------
def ensure_single_mesh(mesh_obj, label="mesh"):
    """Convert Scene to single mesh, or return mesh as-is"""
    if isinstance(mesh_obj, trimesh.Scene):
        mesh_list = mesh_obj.dump()
        
        if not mesh_list:
            raise ValueError(f"{label} scene is empty.")
        
        if len(mesh_list) == 1:
            return mesh_list[0]
        else:
            return trimesh.util.concatenate(mesh_list)
    
    return mesh_obj


# -------------------------------------------------
# Metric Computation (Volume, Area, BBox, etc.)
# -------------------------------------------------
def similarity_exponential(value, sharpness):
    return float(np.exp(-value * sharpness))

def similarity_from_relative_diff(diff, cap=1.0):
    return max(0.0, 1.0 - min(diff, cap) / cap)

def compute_mesh_metrics(gt_mesh, comp_mesh, chamfer, max_dist, S):
    """Compute similarity metrics given two meshes and chamfer/max_dist values.
    
    Args:
        gt_mesh: ground truth mesh
        comp_mesh: comparison mesh (should be aligned if alignment was performed)
        chamfer: chamfer distance value (pre-normalized by diagonal)
        max_dist: max distance value (pre-normalized by diagonal)
        S: sharpness dict {"chamfer": 10, "maxdist": 10}
    
    Returns:
        dict with similarity scores for each metric
    """
    # Ensure we have single meshes for metric computation
    gt_mesh = ensure_single_mesh(gt_mesh, "Ground truth")
    comp_mesh = ensure_single_mesh(comp_mesh, "Comparison")

    volA = gt_mesh.volume
    volB = comp_mesh.volume

    areaA = gt_mesh.area
    areaB = comp_mesh.area

    bboxA = gt_mesh.extents
    bboxB = comp_mesh.extents

    # Volume difference (avoid 0 division)
    if max(volA, volB) < 1e-9:
        vol_diff = 0.0
    else:
        vol_diff = abs(volA - volB) / max(volA, volB)

    # Area difference (avoid 0 division)
    if max(areaA, areaB) < 1e-9:
        area_diff = 0.0
    else:
        area_diff = abs(areaA - areaB) / max(areaA, areaB)

    # Bounding-box difference (avoid invalid norm)
    if np.linalg.norm(bboxA) < 1e-9:
        bbox_diff = 0.0
    else:
        bbox_diff = np.linalg.norm(bboxA - bboxB) / (np.linalg.norm(bboxA) + 1e-9)

    S_chamfer = similarity_exponential(chamfer, S["chamfer"])
    S_volume  = similarity_from_relative_diff(vol_diff)
    S_area    = similarity_from_relative_diff(area_diff)
    S_bbox    = similarity_from_relative_diff(bbox_diff)
    S_maxdist = similarity_exponential(max_dist, S["maxdist"])

    return {
        "S_chamfer": S_chamfer,
        "S_volume": S_volume,
        "S_area": S_area,
        "S_bbox": S_bbox,
        "S_maxdist": S_maxdist,
        "chamfer": chamfer,
        "max_dist": max_dist,
        "volume_diff": vol_diff,
        "area_diff": area_diff,
        "bbox_diff": bbox_diff,
    }


# -------------------------------------------------
# Main Compute Function (FastAPI calls this)
# -------------------------------------------------
def compute_similarity(bytesA, bytesB, user_weights=None, user_sharpness=None):
    """Compute similarity between two meshes using alignment engine and normalized metrics.
    
    Process:
    1. Load both meshes from bytes
    2. Compute alignment using alignment_engine.compute_alignment (centroid+rotation+ICP)
    3. Apply the returned transform to a copy of meshB
    4. Sample and compute chamfer/max_dist on aligned meshes
    5. Normalize by scene diagonal for scale-invariance
    6. Compute bbox/area/volume metrics on aligned geometry
    7. Return comprehensive diagnostics
    """
    meshA = trimesh.load(BytesIO(bytesA), file_type="stl")
    meshB = trimesh.load(BytesIO(bytesB), file_type="stl")

    # Compute scene diagonal for normalization (scale-invariant similarity)
    diag = np.linalg.norm(meshA.bounds[1] - meshA.bounds[0])
    if diag == 0:
        diag = 1.0

    # Try to use the alignment engine (centroid+rotation+ICP)
    warn = None
    aligned_used = False
    meshB_aligned = None
    align_res = None
    try:
        from alignment_engine import compute_alignment

        # compute_alignment expects trimesh meshes and returns a dict with
        # 'transform' (4x4 list), centroids, rotation, chamfer_after, etc.
        align_res = compute_alignment(meshA, meshB)
        transform = np.array(align_res.get("transform"), dtype=float)

        # Apply transform to a copy of meshB for sampling / chamfer / metrics
        meshB_aligned = meshB.copy()
        try:
            meshB_aligned.apply_transform(transform)
        except Exception:
            # if transform shape/orientation unexpected, try transpose
            try:
                meshB_aligned.apply_transform(transform.T)
            except Exception:
                # fallback: don't apply transform, use raw meshB
                meshB_aligned = meshB.copy()

        # Sample points from meshA and aligned meshB using correct safe_sample signature
        np.random.seed(42)
        PA = safe_sample(meshA, 20000, label="Preview A mesh")
        np.random.seed(42)
        PB = safe_sample(meshB_aligned, 20000, label="Preview B mesh (aligned)")

        chamfer, max_dist = chamfer_distance(PA, PB)
        warn = align_res.get("warn", None)
        aligned_used = True
    except Exception as exc:
        # If alignment_engine is unavailable or fails, fall back to computing
        # chamfer on the raw (unaligned) meshes so the API still responds.
        warn = f"alignment_engine error: {exc}"
        np.random.seed(42)
        PA = safe_sample(meshA, 20000, label="Preview A mesh")
        np.random.seed(42)
        PB = safe_sample(meshB, 20000, label="Preview B mesh (raw)")
        chamfer, max_dist = chamfer_distance(PA, PB)
        meshB_aligned = None

    # Normalize chamfer and max_dist by scene diagonal (scale-invariant)
    chamfer_normalized = float(chamfer) / float(diag)
    max_dist_normalized = float(max_dist) / float(diag)

    # Validate and use sharpness (needed by compute_mesh_metrics)
    if user_sharpness is None:
        S = DEFAULT_SHARPNESS  # { chamfer: 10, maxdist: 10 }
    else:
        S = validate_sharpness(user_sharpness)

    # Use the aligned mesh for metric computation when available so bbox/area/volume
    # reflect the same transformed geometry used for chamfer scoring.
    comp_for_metrics = meshB_aligned if aligned_used and meshB_aligned is not None else meshB
    # Pass normalized distances into metric scoring so S_chamfer uses a unitless value.
    metrics = compute_mesh_metrics(meshA, comp_for_metrics, chamfer_normalized, max_dist_normalized, S)

    # ---------------------------------
    # Weight selection (user / default)
    # ---------------------------------
    if user_weights is None:
        W = DEFAULT_WEIGHTS
    else:
        W = validate_weights(user_weights)
    
    # ---------------------------------
    # Weighted final similarity
    # ---------------------------------
    overall = (
        W["chamfer"] * metrics["S_chamfer"] +
        W["volume"]  * metrics["S_volume"] +
        W["area"]    * metrics["S_area"] +
        W["bbox"]    * metrics["S_bbox"] +
        W["maxdist"] * metrics["S_maxdist"]
    )

    result = {
        "overall_similarity": overall,
        "warn": warn,
        "alignment_used": aligned_used,
        "weights_used": W,
        # keep raw distances for debugging/display, but the metric scoring used
        # the normalized versions above (see metrics and S_chamfer).
        "chamfer": float(chamfer),
        "chamfer_normalized": float(chamfer_normalized),
        "max_dist": float(max_dist),
        "max_dist_normalized": float(max_dist_normalized),
        "metrics": {
            "chamfer_similarity": metrics["S_chamfer"],
            "volume_similarity": metrics["S_volume"],
            "area_similarity": metrics["S_area"],
            "bbox_similarity": metrics["S_bbox"],
            "maxdist_similarity": metrics["S_maxdist"],
        }
    }

    # If alignment returned diagnostics, merge a few into the response for visibility
    try:
        if align_res is not None and isinstance(align_res, dict):
            for k in ('transform', 'centroidA', 'centroidB', 'chamfer_after', 'maxdist_after', 'rotation_radians'):
                if k in align_res:
                    result[k] = align_res[k]
    except Exception:
        pass

    return result

