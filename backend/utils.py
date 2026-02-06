import numpy as np
import trimesh
import cadquery as cq
from io import BytesIO
import tempfile
import os
import time


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