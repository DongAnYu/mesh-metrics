from io import BytesIO
import numpy as np
import trimesh
from trimesh.registration import icp
from similarity_engine import chamfer_distance
from trimesh.transformations import euler_matrix, euler_from_matrix
from scipy.spatial import cKDTree
from utils import safe_sample
import math

def ensure_single_mesh(mesh_obj, label="mesh"):
    if isinstance(mesh_obj, trimesh.Scene):
        mesh_list = mesh_obj.dump()
        if not mesh_list:
            raise ValueError(f"{label} scene is empty.")
        if len(mesh_list) == 1:
            return mesh_list[0]
        return trimesh.util.concatenate(mesh_list)
    return mesh_obj

def surface_centroid(mesh):
    """Compute the area-weighted centroid of the mesh surface."""
    faces = mesh.faces
    vertices = mesh.vertices

    if faces is None or len(faces) == 0:
        raise ValueError("Mesh has no faces to compute surface centroid")

    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]

    tri_centroids = (v0 + v1 + v2) / 3.0
    cross = np.cross(v1 - v0, v2 - v0)
    tri_areas = np.linalg.norm(cross, axis=1) * 0.5

    total_area = np.sum(tri_areas)
    if total_area < 1e-12:
        raise ValueError("Mesh has near-zero surface area")

    centroid = np.sum(tri_centroids * tri_areas[:, None], axis=0) / total_area
    return centroid


def compute_alignment(meshA, meshB):
    # Ensure single mesh (Scene → Mesh)
    meshA = ensure_single_mesh(meshA, "A")
    meshB = ensure_single_mesh(meshB, "B")

    # --- Compute centroids (area-weighted surface centroids) ---
    centroid_A = surface_centroid(meshA)
    centroid_B = surface_centroid(meshB)

    # --- Translation needed to move B → A ---
    translation = centroid_A - centroid_B

    # --- Build 4x4 transform matrix ---
    T = np.eye(4)
    T[:3, 3] = translation

    print("A centroid:", centroid_A)
    print("B centroid before:", centroid_B)
    print("Translation:", translation)
    
    # Apply translation to a copy of meshB for rotation search
    meshB_translated = meshB.copy()
    meshB_translated.apply_translation(translation)

    # OPTIMIZED SAMPLING STRATEGY - further reduced for speed
    if meshA.area > 10000:
        SAMPLE_GRID = 2500  # Reduced from 5000
        SAMPLE_ICP = 8000   # Reduced from 15000
    elif meshA.area > 1000:
        SAMPLE_GRID = 1500  # Reduced from 3000
        SAMPLE_ICP = 5000   # Reduced from 10000
    else:
        SAMPLE_GRID = 1000  # Reduced from 2000
        SAMPLE_ICP = 3000   # Reduced from 8000

    try:
        PA_grid = safe_sample(meshA, min(SAMPLE_GRID, int(max(100, meshA.area))), label="PA_grid")
        PB_grid = safe_sample(meshB_translated, min(SAMPLE_GRID, int(max(100, meshB_translated.area))), label="PB_grid")
    except Exception:
        PA_grid = meshA.vertices
        PB_grid = meshB_translated.vertices

    try:
        PA_icp = safe_sample(meshA, min(SAMPLE_ICP, int(max(100, meshA.area))), label="PA_icp")
        PB_icp = safe_sample(meshB_translated, min(SAMPLE_ICP, int(max(100, meshB_translated.area))), label="PB_icp")
    except Exception:
        PA_icp = meshA.vertices
        PB_icp = meshB_translated.vertices

    # PRE-BUILD KD-TREE FOR TARGET (reused across all rotations)
    kdtree_A = cKDTree(PA_grid)
    
    # Compute baseline chamfer after translation
    best_chamfer, best_max = chamfer_distance(PA_grid, PB_grid)
    best_transform = T.copy()
    best_angles = (0.0, 0.0, 0.0)
    
    # Pre-compute rotation matrix components for speed
    T_neg = np.eye(4)
    T_neg[:3, 3] = -centroid_A
    T_pos = np.eye(4)
    T_pos[:3, 3] = centroid_A
    
    def apply_rotation_fast(rx, ry, rz, full_chamfer=False):
        """Fast rotation scoring with optional full chamfer for final candidates"""
        R = euler_matrix(rx, ry, rz)
        R_about = T_pos @ R @ T_neg
        
        # Direct matrix multiplication (faster than trimesh.transform_points)
        PB_rot = (PB_grid @ R_about[:3, :3].T) + R_about[:3, 3]
        
        if full_chamfer:
            # Full bi-directional chamfer for final scoring
            d, m = chamfer_distance(PA_grid, PB_rot)
            return d, m, R_about
        else:
            # One-way chamfer for coarse search (2x faster)
            d1, _ = kdtree_A.query(PB_rot)
            score = np.mean(d1)
            return score, None, R_about

    def adaptive_rotation_search(initial_transform):
        """Optimized multi-resolution rotation search with fast scoring"""
        best_c = float('inf')
        best_t = initial_transform.copy()
        best_a = (0.0, 0.0, 0.0)

        # Level 1: Coarse (every 90° - 64 evaluations, one-way chamfer)
        angles_90 = np.linspace(0, 2*np.pi, 4, endpoint=False)
        for rx in angles_90:
            for ry in angles_90:
                for rz in angles_90:
                    score, _, R_about = apply_rotation_fast(rx, ry, rz, full_chamfer=False)
                    if score < best_c:
                        best_c = score
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        # Level 2: Medium around best (every 20° in ±40° range - 64 evaluations, one-way)
        rx0, ry0, rz0 = best_a
        angles_20 = np.deg2rad(np.arange(-40, 45, 20))
        for drx in angles_20:
            for dry in angles_20:
                for drz in angles_20:
                    rx = rx0 + drx; ry = ry0 + dry; rz = rz0 + drz
                    score, _, R_about = apply_rotation_fast(rx, ry, rz, full_chamfer=False)
                    if score < best_c:
                        best_c = score
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        # Level 3: Fine around best (every 5° in ±15° range - 49 evaluations, one-way)
        rx0, ry0, rz0 = best_a
        angles_5 = np.deg2rad(np.arange(-15, 20, 5))
        for drx in angles_5:
            for dry in angles_5:
                for drz in angles_5:
                    rx = rx0 + drx; ry = ry0 + dry; rz = rz0 + drz
                    score, _, R_about = apply_rotation_fast(rx, ry, rz, full_chamfer=False)
                    if score < best_c:
                        best_c = score
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        # FINAL EVALUATION: Compute FULL bi-directional chamfer for best candidate only
        rx_final, ry_final, rz_final = best_a
        final_chamfer, final_max, _ = apply_rotation_fast(rx_final, ry_final, rz_final, full_chamfer=True)

        return final_chamfer, best_t, best_a, final_max

    # Run optimized rotation search (177 fast evaluations + 1 full chamfer)
    best_chamfer, best_transform, best_angles, best_max = adaptive_rotation_search(T)

    # --- Multi-start ICP refinement (fewer starts, faster convergence) ---
    try:
        NUM_ICP_STARTS = 3  # Reduced from 5 (rotation search is already good)
        ICP_MAX_ITER = 30   # Reduced from 50 (usually converges faster)

        rng = np.random.default_rng(12345)

        PA_points = PA_icp
        PB_points = PB_icp

        best_icp_chamfer = best_chamfer
        best_icp_max = best_max
        best_icp_transform = best_transform

        for i in range(NUM_ICP_STARTS):
            # Random Euler angles
            rx = rng.uniform(0.0, 2 * math.pi)
            ry = rng.uniform(0.0, 2 * math.pi)
            rz = rng.uniform(0.0, 2 * math.pi)

            R_init = euler_matrix(rx, ry, rz)
            T_neg_icp = np.eye(4); T_neg_icp[:3, 3] = -centroid_A
            T_pos_icp = np.eye(4); T_pos_icp[:3, 3] = centroid_A
            R_about_init = T_pos_icp @ R_init @ T_neg_icp

            # Direct matrix transform (faster)
            PB_init = (PB_points @ R_about_init[:3, :3].T) + R_about_init[:3, 3]

            try:
                T_icp, _, _ = icp(PB_init, PA_points, max_iterations=ICP_MAX_ITER)
            except Exception:
                continue

            combined = T_icp @ R_about_init @ T
            PB_final = (PB_points @ (T_icp @ R_about_init)[:3, :3].T) + (T_icp @ R_about_init)[:3, 3]

            d_icp, m_icp = chamfer_distance(PA_points, PB_final)
            if d_icp < best_icp_chamfer:
                best_icp_chamfer = d_icp
                best_icp_max = m_icp
                best_icp_transform = combined

        # Adopt ICP results if better
        if best_icp_chamfer < best_chamfer:
            best_chamfer = best_icp_chamfer
            best_max = best_icp_max
            best_transform = best_icp_transform
            try:
                rot_euler = euler_from_matrix(best_transform, axes='sxyz')
                best_angles = (float(rot_euler[0]), float(rot_euler[1]), float(rot_euler[2]))
            except Exception:
                pass
    except Exception:
        pass

    result = {
        "transform": best_transform.tolist(),
        "centroidA": centroid_A.tolist(),
        "centroidB": centroid_B.tolist(),
        "type": "centroid+rotation",
        "chamfer_after": float(best_chamfer),
        "maxdist_after": float(best_max),
        "rotation_radians": [float(a) for a in best_angles]
    }

    return result