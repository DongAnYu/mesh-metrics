import numpy as np
import trimesh
import cadquery as cq
from io import BytesIO
import tempfile
import os
import time


SUPPORTED_MESH_EXTENSIONS = {".stl", ".step", ".stp"}


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


def to_solid(obj):
    """Convert CadQuery object to a solid/compound."""
    if isinstance(obj, cq.Workplane):
        obj = obj.val()
    
    if isinstance(obj, (cq.Solid, cq.Compound)):
        return obj
    
    if isinstance(obj, cq.Assembly):
        # Extract all solids from assembly
        shapes = []
        for _, item in obj.traverse():
            if item.shapes:
                shapes.extend(item.shapes)
        if shapes:
            return cq.Compound.makeCompound(shapes)
    
    raise ValueError(f"Cannot convert {type(obj)} to solid")


def execute_cadquery_script(script: str) -> bytes:
    """
    Executes the provided CadQuery script via exec() and returns the STL bytes.
    The script should produce a 'result' variable or the last CadQuery object will be used.
    """
    env = {"__builtins__": __builtins__, "cq": cq}
    
    try:
        print("[CadQuery] Executing script:")
        print(script)
        exec(script, env, env)

        # Capture resulting cadquery object
        obj = None
        if "result" in env:
            obj = env["result"]
            print("[INFO] Using 'result' variable")
        else:
            # If cq object is not named 'result', try to find the last cq object
            for last_key, last_value in reversed(env.items()):
                if isinstance(last_value, cq.Workplane):
                    obj = last_value
                    print(f"[INFO] Using last key '{last_key}' as result (Workplane)")
                    break
                elif isinstance(last_value, cq.Assembly):
                    obj = last_value
                    print(f"[INFO] Using last key '{last_key}' as result (Assembly)")
                    break
                elif isinstance(last_value, cq.Compound):
                    obj = last_value
                    print(f"[INFO] Using last key '{last_key}' as result (Compound)")
                    break
                elif isinstance(last_value, cq.Solid):
                    obj = last_value
                    print(f"[INFO] Using last key '{last_key}' as result (Solid)")
                    break
        
        if obj is None:
            raise ValueError("The script did not produce a 'result' variable or any CadQuery object.")
        
        # Convert to solid
        obj = to_solid(obj)
        
        # Export to STL using temporary file
        print("[INFO] Exporting to STL...")
        export_start = time.perf_counter()
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.stl', delete=False) as tmp_file:
            tmp_path = tmp_file.name
        
        try:
            # Export to the temporary file
            cq.exporters.export(obj, tmp_path, "STL")
            export_time = time.perf_counter() - export_start
            
            # Read the STL bytes
            with open(tmp_path, 'rb') as f:
                stl_bytes = f.read()
            
            print(f"[INFO] STL export successful in {export_time:.2f}s, size: {len(stl_bytes)} bytes")
            
            # Warn if export took a long time
            if export_time > 5.0:
                print(f"[WARNING] STL export took {export_time:.2f}s - consider using CQ-Editor for complex models")
            
            return stl_bytes
            
        finally:
            # Clean up the temporary file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        
    except Exception as e:
        print(f"[ERROR] CadQuery execution failed: {str(e)}")
        raise ValueError(f"CadQuery execution error: {str(e)}")


def _cleanup_trimesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    try:
        if hasattr(mesh, "remove_degenerate_faces"):
            mesh.remove_degenerate_faces()
        elif hasattr(mesh, "nondegenerate_faces") and hasattr(mesh, "update_faces"):
            mask = mesh.nondegenerate_faces()
            mesh.update_faces(mask)
    except Exception:
        pass

    try:
        if hasattr(mesh, "remove_unreferenced_vertices"):
            mesh.remove_unreferenced_vertices()
    except Exception:
        pass

    try:
        if hasattr(mesh, "merge_vertices"):
            mesh.merge_vertices()
    except Exception:
        pass

    return mesh


def _ensure_single_mesh(mesh_obj, label="mesh") -> trimesh.Trimesh:
    if isinstance(mesh_obj, trimesh.Scene):
        mesh_list = mesh_obj.dump()
        if not mesh_list:
            raise ValueError(f"{label} scene is empty.")
        if len(mesh_list) == 1:
            mesh_obj = mesh_list[0]
        else:
            mesh_obj = trimesh.util.concatenate(mesh_list)

    if not isinstance(mesh_obj, trimesh.Trimesh):
        raise ValueError(f"{label} could not be converted to a mesh.")

    return mesh_obj


def stl_to_trimesh(stl_bytes: bytes) -> trimesh.Trimesh:
    mesh = trimesh.load(BytesIO(stl_bytes), file_type="stl", force="mesh")
    mesh = _ensure_single_mesh(mesh, "STL mesh")
    return _cleanup_trimesh(mesh)


def step_to_trimesh(step_bytes: bytes, deflection: float = 0.001, angle: float = 0.1) -> trimesh.Trimesh:
    step_path = None
    stl_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".step", delete=False) as step_file:
            step_file.write(step_bytes)
            step_path = step_file.name

        with tempfile.NamedTemporaryFile(mode="wb", suffix=".stl", delete=False) as stl_file:
            stl_path = stl_file.name

        imported = cq.importers.importStep(step_path)
        shape = to_solid(imported)

        cq.exporters.export(
            shape,
            stl_path,
            exportType="STL",
            tolerance=deflection,
            angularTolerance=angle,
        )

        with open(stl_path, "rb") as f:
            stl_bytes = f.read()

        return stl_to_trimesh(stl_bytes)
    except Exception as exc:
        raise ValueError(f"STEP conversion failed: {exc}")
    finally:
        if step_path and os.path.exists(step_path):
            os.unlink(step_path)
        if stl_path and os.path.exists(stl_path):
            os.unlink(stl_path)


def load_mesh_from_upload(file_bytes: bytes, filename: str | None, step_deflection: float = 0.001, step_angle: float = 0.1) -> trimesh.Trimesh:
    ext = os.path.splitext((filename or "").lower())[1]

    if ext == ".stl":
        return stl_to_trimesh(file_bytes)

    if ext in {".step", ".stp"}:
        return step_to_trimesh(file_bytes, deflection=step_deflection, angle=step_angle)

    try:
        return stl_to_trimesh(file_bytes)
    except Exception:
        pass

    try:
        return step_to_trimesh(file_bytes, deflection=step_deflection, angle=step_angle)
    except Exception:
        raise ValueError(
            f"Unsupported mesh format '{ext or 'unknown'}'. Supported formats: {sorted(SUPPORTED_MESH_EXTENSIONS)}"
        )


def mesh_to_stl_bytes(mesh: trimesh.Trimesh) -> bytes:
    mesh = _cleanup_trimesh(mesh.copy())
    exported = mesh.export(file_type="stl")
    if isinstance(exported, (bytes, bytearray)):
        return bytes(exported)
    return exported.encode("utf-8")