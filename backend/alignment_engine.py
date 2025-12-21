from io import BytesIO
import numpy as np
import trimesh
from trimesh.registration import icp
from similarity_engine import chamfer_distance, similarity_exponential
from trimesh.transformations import euler_matrix, euler_from_matrix
from scipy.spatial import cKDTree
from utils import safe_sample
import math
import config

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
    if total_area < config.MIN_SURFACE_AREA:
        raise ValueError("Mesh has near-zero surface area")

    centroid = np.sum(tri_centroids * tri_areas[:, None], axis=0) / total_area
    return centroid


def compute_alignment(meshA, meshB, user_sharpness=None):
    # Ensure single mesh (Scene → Mesh)
    meshA = ensure_single_mesh(meshA, "A")
    meshB = ensure_single_mesh(meshB, "B")
    
    # Use user-provided sharpness or default
    S = user_sharpness if user_sharpness is not None else config.DEFAULT_SHARPNESS

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

    # Compute scene diagonal for normalization (scale-invariant similarity)
    diag = np.linalg.norm(meshA.bounds[1] - meshA.bounds[0])
    if diag < config.MIN_DIAGONAL:
        diag = 1.0

    # ADAPTIVE SAMPLING STRATEGY based on mesh area
    if meshA.area > config.AREA_THRESHOLD_LARGE:
        print(f"Large mesh (area={meshA.area:.2f})")
        SAMPLE_GRID = config.SAMPLE_GRID_LARGE
        SAMPLE_ICP = config.SAMPLE_ICP_LARGE
    elif meshA.area > config.AREA_THRESHOLD_MEDIUM:
        print(f"Medium mesh (area={meshA.area:.2f})")
        SAMPLE_GRID = config.SAMPLE_GRID_MEDIUM
        SAMPLE_ICP = config.SAMPLE_ICP_MEDIUM
    else:
        print(f"Small mesh (area={meshA.area:.2f})")
        SAMPLE_GRID = config.SAMPLE_GRID_SMALL
        SAMPLE_ICP = config.SAMPLE_ICP_SMALL

    try:
        PA_grid = safe_sample(meshA, min(SAMPLE_GRID, int(max(config.MIN_SAMPLE_COUNT, meshA.area))), label="PA_grid")
        PB_grid = safe_sample(meshB_translated, min(SAMPLE_GRID, int(max(config.MIN_SAMPLE_COUNT, meshB_translated.area))), label="PB_grid")
    except Exception:
        PA_grid = meshA.vertices
        PB_grid = meshB_translated.vertices

    try:
        PA_icp = safe_sample(meshA, min(SAMPLE_ICP, int(max(config.MIN_SAMPLE_COUNT, meshA.area))), label="PA_icp")
        PB_icp = safe_sample(meshB_translated, min(SAMPLE_ICP, int(max(config.MIN_SAMPLE_COUNT, meshB_translated.area))), label="PB_icp")
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
        angles_90 = np.linspace(0, 2*np.pi, config.ROTATION_COARSE_STEPS, endpoint=False)
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
        angles_20 = np.deg2rad(np.arange(-config.ROTATION_MEDIUM_RANGE_DEG, 
                                          config.ROTATION_MEDIUM_RANGE_DEG + config.ROTATION_MEDIUM_STEP_DEG, 
                                          config.ROTATION_MEDIUM_STEP_DEG))
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
        angles_5 = np.deg2rad(np.arange(-config.ROTATION_FINE_RANGE_DEG, 
                                         config.ROTATION_FINE_RANGE_DEG + config.ROTATION_FINE_STEP_DEG, 
                                         config.ROTATION_FINE_STEP_DEG))
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
    print("best_chamfer_before_icp", best_chamfer)

    # --- Multi-start ICP refinement with consistent evaluation methodology ---
    try:
        rng = np.random.default_rng(config.ICP_RANDOM_SEED)

        PA_points = PA_icp
        PB_points = PB_icp

        # Store all candidate transforms for final evaluation
        candidate_transforms = [("no-ICP", best_transform)]

        # Run ICP from multiple random starts
        for i in range(config.NUM_ICP_STARTS):
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
                T_icp, _, _ = icp(PB_init, PA_points, max_iterations=config.ICP_MAX_ITERATIONS)
            except Exception:
                continue

            combined = T_icp @ R_about_init @ T
            candidate_transforms.append((f"ICP-{i}", combined))

        # --- CONSISTENT EVALUATION: Test all candidates the same way ---
        # Use same seed for all evaluations to match frontend behavior
        np.random.seed(config.EVAL_RANDOM_SEED)
        PA_eval = safe_sample(meshA, config.EVAL_SAMPLE_COUNT, label="PA_eval")
        
        best_candidate_name = None
        best_candidate_transform = None
        best_candidate_chamfer = float('inf')
        best_candidate_max = float('inf')
        best_candidate_similarity = -float('inf')

        for name, transform in candidate_transforms:
            # 1. Apply transform to meshB
            meshB_transformed = meshB.copy()
            meshB_transformed.apply_transform(transform)
            
            # 2. Resample points (same count + seed as frontend)
            np.random.seed(config.EVAL_RANDOM_SEED)
            PB_eval = safe_sample(meshB_transformed, config.EVAL_SAMPLE_COUNT, label=f"PB_eval_{name}")
            
            # 3. Compute chamfer (bi-directional)
            chamfer_eval, max_eval = chamfer_distance(PA_eval, PB_eval)
            
            # 4. Normalize by diagonal
            chamfer_normalized = float(chamfer_eval) / float(diag)
            max_normalized = float(max_eval) / float(diag)
            
            # 5. Convert → similarity_exponential
            similarity_score = similarity_exponential(chamfer_normalized, S["chamfer"])
            
            print(f"Candidate {name}: chamfer={chamfer_eval:.6f}, similarity={similarity_score:.6f}")
            
            # Pick the transform with the higher similarity
            if similarity_score > best_candidate_similarity:
                best_candidate_name = name
                best_candidate_transform = transform
                best_candidate_chamfer = chamfer_eval
                best_candidate_max = max_eval
                best_candidate_similarity = similarity_score

        print(f"Winner: {best_candidate_name} with similarity={best_candidate_similarity:.6f}")
        
        # Adopt the best candidate
        best_chamfer = best_candidate_chamfer
        best_max = best_candidate_max
        best_transform = best_candidate_transform
        
        try:
            rot_euler = euler_from_matrix(best_transform, axes='sxyz')
            best_angles = (float(rot_euler[0]), float(rot_euler[1]), float(rot_euler[2]))
        except Exception:
            pass
            
    except Exception as e:
        print(f"ICP refinement failed: {e}")
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