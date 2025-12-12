from io import BytesIO
import numpy as np
import trimesh
from trimesh.registration import icp

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

    # --- Compute centroids ---
    centroid_A = meshA.vertices.mean(axis=0)
    centroid_B = meshB.vertices.mean(axis=0)

    # --- Translation needed to move B → A ---
    translation = centroid_A - centroid_B

    # --- Build 4x4 transform matrix ---
    T = np.eye(4)
    T[:3, 3] = translation

    print("A centroid:", centroid_A)
    print("B centroid before:", centroid_B)
    print("Translation:", translation)

    return {
        "transform": T.tolist(),
        "centroidA": centroid_A.tolist(),
        "centroidB": centroid_B.tolist(),
        "type": "centroid-only"
    }