from io import BytesIO
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from trimesh.registration import icp

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
# PCA canonicalization
# -------------------------------------------------
def canonicalize_points(points):
    centroid = points.mean(axis=0)
    centered = points - centroid

    cov = np.cov(centered.T)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    idx = np.argsort(eigenvalues)[::-1]
    eigenvectors = eigenvectors[:, idx]

    if np.linalg.det(eigenvectors) < 0:
        eigenvectors[:, 2] *= -1

    aligned = centered @ eigenvectors

    for i in range(3):
        max_idx = np.argmax(np.abs(aligned[:, i]))
        if aligned[max_idx, i] < 0:
            aligned[:, i] *= -1

    return aligned

def safe_sample(mesh, n_points, diag, label="mesh"):
    # If this is a Scene, merge to a single mesh
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump().sum()

    # Check if mesh is valid for surface sampling
    if mesh.is_empty or mesh.faces is None or len(mesh.faces) == 0 or mesh.area < 1e-9:
        raise ValueError(f"{label} has no valid faces or zero area, cannot sample surface.")

    return mesh.sample(n_points) / diag

# -------------------------------------------------
# PCA + Reflection Search + ICP Alignment
# -------------------------------------------------
def align_meshes(gt_mesh, comp_mesh):
    diag = np.linalg.norm(gt_mesh.bounds[1] - gt_mesh.bounds[0])
    if diag == 0:
        diag = 1.0

    np.random.seed(42)
    PA = safe_sample(gt_mesh, 8000, diag, label="Preview A mesh")

    np.random.seed(42)
    PB = safe_sample(comp_mesh, 8000, diag, label="Preview B mesh")

    PA_canon = canonicalize_points(PA)

    reflect_ops = [
        np.array([1,1,1]),
        np.array([-1,1,1]),
        np.array([1,-1,1]),
        np.array([1,1,-1]),
        np.array([-1,-1,1]),
        np.array([-1,1,-1]),
        np.array([1,-1,-1]),
        np.array([-1,-1,-1])
    ]

    PB_centered = PB - PB.mean(0)

    best_dist = float("inf")
    best = None

    for refl in reflect_ops:
        PB_test = PB_centered * refl
        PB_test = canonicalize_points(PB_test)
        d = np.mean(np.linalg.norm(PB_test - PA_canon, axis=1))

        if d < best_dist:
            best_dist = d
            best = PB_test

    PB_best = best

    try:
        T, _, _ = icp(PB_best, PA_canon, max_iterations=5000)
        PB_aligned = trimesh.transform_points(PB_best, T)
        warn = None
    except:
        PB_aligned = PB_best
        warn = "ICP_WARN"

    return PA_canon, PB_aligned, warn


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
# Metric Computation (Volume, Area, BBox, etc.)
# -------------------------------------------------
def similarity_exponential(value, sharpness):
    return float(np.exp(-value * sharpness))

def similarity_from_relative_diff(diff, cap=1.0):
    return max(0.0, 1.0 - min(diff, cap) / cap)

def compute_mesh_metrics(gt_mesh, comp_mesh, chamfer, max_dist):

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


    S_chamfer = similarity_exponential(chamfer, 3)
    S_volume  = similarity_from_relative_diff(vol_diff)
    S_area    = similarity_from_relative_diff(area_diff)
    S_bbox    = similarity_from_relative_diff(bbox_diff)
    S_maxdist = similarity_exponential(max_dist, 2)

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
def compute_similarity(bytesA, bytesB, user_weights=None):
    meshA = trimesh.load(BytesIO(bytesA), file_type="stl")
    meshB = trimesh.load(BytesIO(bytesB), file_type="stl")

    A, B, warn = align_meshes(meshA, meshB)

    chamfer, max_dist = chamfer_distance(A, B)

    metrics = compute_mesh_metrics(meshA, meshB, chamfer, max_dist)

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

    return {
        "overall_similarity": overall,
        "warn": warn,
        "weights_used": W,
        "chamfer": chamfer,
        "max_dist": max_dist,
        "metrics": {
            "chamfer_similarity": metrics["S_chamfer"],
            "volume_similarity": metrics["S_volume"],
            "area_similarity": metrics["S_area"],
            "bbox_similarity": metrics["S_bbox"],
            "maxdist_similarity": metrics["S_maxdist"],
        }
    }
