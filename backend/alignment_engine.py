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

    return {
        "transform": T.tolist(),
        "centroidA": centroid_A.tolist(),
        "centroidB": centroid_B.tolist(),
        "type": "centroid-only"
    }