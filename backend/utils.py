import numpy as np
import trimesh


def safe_sample(mesh, n_points, label="mesh"):
    """Sample surface points safely from a mesh or Scene.

    - If a Scene is provided, concatenate into a single mesh.
    - Validate the mesh has faces and non-zero area.
    - If sampling fails, fall back to returning the mesh vertices.

    Returns: (n_points x 3) ndarray of points in mesh coordinates.
    """
    # If this is a Scene, merge to a single mesh
    if isinstance(mesh, trimesh.Scene):
        mesh_list = mesh.dump()
        if not mesh_list:
            raise ValueError(f"{label} scene is empty, cannot sample.")
        if len(mesh_list) == 1:
            mesh = mesh_list[0]
        else:
            mesh = trimesh.util.concatenate(mesh_list)

    # Check if mesh is valid for surface sampling
    if mesh.is_empty or mesh.faces is None or len(mesh.faces) == 0 or mesh.area < 1e-9:
        raise ValueError(f"{label} has no valid faces or zero area, cannot sample surface.")

    try:
        pts = mesh.sample(n_points)
        return pts
    except Exception:
        # Fallback: return vertex positions (may be much smaller/larger than n_points)
        try:
            return mesh.vertices
        except Exception:
            raise
