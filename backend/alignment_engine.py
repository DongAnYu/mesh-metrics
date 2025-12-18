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

def sample_surface_points(mesh, n_points=8000, label="mesh"):
    if mesh.is_empty or mesh.faces is None or len(mesh.faces) == 0:
        raise ValueError(f"{label} has no valid faces.")

    if mesh.area < 1e-9:
        raise ValueError(f"{label} has zero surface area.")

    return mesh.sample(n_points)



def compute_alignment(meshA, meshB):
    # Ensure single mesh (Scene → Mesh)
    meshA = ensure_single_mesh(meshA, "A")
    meshB = ensure_single_mesh(meshB, "B")

    def surface_centroid(mesh):
        """Compute the area-weighted centroid of the mesh surface.

        Uses triangle centroids weighted by triangle area. This is
        robust to non-uniform vertex density and better reflects the
        geometric(surface) center of mass.
        """
        faces = mesh.faces
        vertices = mesh.vertices

        if faces is None or len(faces) == 0:
            raise ValueError("Mesh has no faces to compute surface centroid")

        v0 = vertices[faces[:, 0]]
        v1 = vertices[faces[:, 1]]
        v2 = vertices[faces[:, 2]]

        # triangle centroids
        tri_centroids = (v0 + v1 + v2) / 3.0

        # triangle areas (0.5 * |(v1-v0) x (v2-v0)|)
        cross = np.cross(v1 - v0, v2 - v0)
        tri_areas = np.linalg.norm(cross, axis=1) * 0.5

        total_area = np.sum(tri_areas)
        if total_area < 1e-12:
            raise ValueError("Mesh has near-zero surface area")

        centroid = np.sum(tri_centroids * tri_areas[:, None], axis=0) / total_area
        return centroid

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

    # OPTIMIZED SAMPLING STRATEGY
    # Use fewer points for rotation/grid search, more for ICP refinement
    # Sampling counts chosen by mesh area (not by scaling)
    if meshA.area > 10000:
        SAMPLE_GRID = 5000
        SAMPLE_ICP = 15000
    elif meshA.area > 1000:
        SAMPLE_GRID = 3000
        SAMPLE_ICP = 10000
    else:
        SAMPLE_GRID = 2000
        SAMPLE_ICP = 8000

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

    # Compute baseline chamfer after translation (use grid samples)
    best_chamfer, best_max = chamfer_distance(PA_grid, PB_grid)
    best_transform = T.copy()
    best_angles = (0.0, 0.0, 0.0)
    def apply_rotation_and_score(rx, ry, rz):
        # rotation matrix from Euler angles (rx, ry, rz) in radians
        R = euler_matrix(rx, ry, rz)
        # rotate about centroid_A: translate to origin, rotate, translate back
        T_neg = np.eye(4); T_neg[:3, 3] = -centroid_A
        T_pos = np.eye(4); T_pos[:3, 3] = centroid_A
        R_about = T_pos @ R @ T_neg
        # apply to PB_grid points (avoid transforming full mesh for speed)
        PB_rot = trimesh.transform_points(PB_grid, R_about)

        d, m = chamfer_distance(PA_grid, PB_rot)
        return d, m, R_about

    def adaptive_rotation_search(initial_transform):
        """Multi-resolution adaptive rotation search around centroid_A."""
        best_c = float('inf')
        best_t = initial_transform.copy()
        best_a = (0.0, 0.0, 0.0)

        # Level 1: Coarse (every 45°)
        angles_45 = np.linspace(0, 2*np.pi, 4, endpoint=False)
        for rx in angles_45:
            for ry in angles_45:
                for rz in angles_45:
                    d, m, R_about = apply_rotation_and_score(rx, ry, rz)
                    if d < best_c:
                        best_c = d
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        # Level 2: Medium around best (every 10° in ±30° range)
        rx0, ry0, rz0 = best_a
        angles_10 = np.deg2rad(np.arange(-30, 35, 20))
        for drx in angles_10:
            for dry in angles_10:
                for drz in angles_10:
                    rx = rx0 + drx; ry = ry0 + dry; rz = rz0 + drz
                    d, m, R_about = apply_rotation_and_score(rx, ry, rz)
                    if d < best_c:
                        best_c = d
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        # Level 3: Fine around best (every 2° in ±10° range)
        rx0, ry0, rz0 = best_a
        angles_2 = np.deg2rad(np.arange(-10, 12, 4))
        for drx in angles_2:
            for dry in angles_2:
                for drz in angles_2:
                    rx = rx0 + drx; ry = ry0 + dry; rz = rz0 + drz
                    d, m, R_about = apply_rotation_and_score(rx, ry, rz)
                    if d < best_c:
                        best_c = d
                        best_t = R_about @ initial_transform
                        best_a = (rx, ry, rz)

        return best_c, best_t, best_a

    # Run adaptive multi-resolution rotation search (uses PA_grid / PB_grid)
    best_chamfer, best_transform, best_angles = adaptive_rotation_search(T)
    # try to compute best_max from the best transform by applying it to grid points
    try:
        PB_candidate = trimesh.transform_points(PB_grid, best_transform)
        best_max = chamfer_distance(PA_grid, PB_candidate)[1]
    except Exception:
        pass

    # --- Multi-start ICP refinement ---
    # Try several random initial rotations (around centroid_A) and run ICP from each start.
    # Keep the best transform that yields lowest chamfer distance.
    try:
        NUM_ICP_STARTS = 5
        ICP_MAX_ITER = 50

        rng = np.random.default_rng(12345)

        # Use denser sampling for ICP stage
        PA_points = PA_icp
        PB_points = PB_icp  # already translated points (meshB translated by T)

        best_icp_chamfer = best_chamfer
        best_icp_max = best_max
        best_icp_transform = best_transform

        # Pre-build KD for PA for efficient scoring
        for i in range(NUM_ICP_STARTS):
            # random Euler angles
            rx = rng.uniform(0.0, 2 * math.pi)
            ry = rng.uniform(0.0, 2 * math.pi)
            rz = rng.uniform(0.0, 2 * math.pi)

            R_init = euler_matrix(rx, ry, rz)
            T_neg = np.eye(4); T_neg[:3, 3] = -centroid_A
            T_pos = np.eye(4); T_pos[:3, 3] = centroid_A
            R_about_init = T_pos @ R_init @ T_neg

            # Apply initial random rotation to source points
            PB_init = trimesh.transform_points(PB_points, R_about_init)

            # Run trimesh icp: align PB_init -> PA_points
            try:
                T_icp, _, _ = icp(PB_init, PA_points, max_iterations=ICP_MAX_ITER)
            except Exception:
                # If trimesh.icp fails for some start, skip it
                continue

            # Combined transform maps original meshB -> (apply translation T, random rotation, then ICP)
            combined = T_icp @ R_about_init @ T

            # Apply combined to the sampled PB_points (which are already translated by T)
            PB_final = trimesh.transform_points(PB_points, T_icp @ R_about_init)

            # Score with chamfer (use ICP-sampled dense sets)
            d_icp, m_icp = chamfer_distance(PA_points, PB_final)
            if d_icp < best_icp_chamfer:
                best_icp_chamfer = d_icp
                best_icp_max = m_icp
                best_icp_transform = combined

        # If ICP produced an improvement, adopt ICP results
        if best_icp_chamfer < best_chamfer:
            best_chamfer = best_icp_chamfer
            best_max = best_icp_max
            best_transform = best_icp_transform
            # try to extract Euler angles from rotation part of transform
            try:
                rot_euler = euler_from_matrix(best_transform, axes='sxyz')
                best_angles = (float(rot_euler[0]), float(rot_euler[1]), float(rot_euler[2]))
            except Exception:
                # keep previous best_angles if extraction fails
                pass
    except Exception:
        # Non-fatal: if multi-start ICP fails entirely, keep previous best
        pass

    # If we found an improved rotation, return combined transform
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