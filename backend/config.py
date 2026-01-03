"""
Centralized configuration for mesh alignment and similarity computation.
All constants and hyperparameters are managed here for easy tuning.
"""

# =============================================================================
# SIMILARITY METRICS - Default Weights (must sum to 1.0)
# =============================================================================
DEFAULT_WEIGHTS = {
    "chamfer": 0.50,
    "volume": 0.25,
    "area": 0.15,
    "bbox": 0.05,
    "maxdist": 0.05,
}

# =============================================================================
# SIMILARITY METRICS - Sharpness Parameters
# =============================================================================
# Higher values = steeper exponential decay (more sensitive to differences)
DEFAULT_SHARPNESS = {
    "chamfer": 10,
    "maxdist": 10,
}

# =============================================================================
# SAMPLING STRATEGY - Adaptive based on mesh area
# =============================================================================
# Grid search sampling (for rotation optimization)
# SAMPLE_GRID_LARGE = 2500   # For meshes with area > 10000
# SAMPLE_GRID_MEDIUM = 1500  # For meshes with area > 1000
# SAMPLE_GRID_SMALL = 1000   # For smaller meshes

SAMPLE_GRID_LARGE = 1500   # For meshes with area > 10000
SAMPLE_GRID_MEDIUM = 500  # For meshes with area > 1000
SAMPLE_GRID_SMALL = 100   # For smaller meshes

# ICP sampling (for refinement)
SAMPLE_ICP_LARGE = 8000    # For meshes with area > 10000
SAMPLE_ICP_MEDIUM = 5000   # For meshes with area > 1000
SAMPLE_ICP_SMALL = 3000    # For smaller meshes

# Area thresholds for adaptive sampling
AREA_THRESHOLD_LARGE = 10000
AREA_THRESHOLD_MEDIUM = 1000

# Minimum sample count (safety fallback)
MIN_SAMPLE_COUNT = 100

# =============================================================================
# EVALUATION SAMPLING - Must match frontend for consistency
# =============================================================================
EVAL_SAMPLE_COUNT = 20000  # Used for final candidate comparison
EVAL_RANDOM_SEED = 42      # Must match frontend seed for reproducibility

# =============================================================================
# ROTATION SEARCH - Multi-resolution grid parameters
# =============================================================================
# Level 1: Coarse search
ROTATION_COARSE_STEPS = 4  # Every 90° (2π/4)

# Level 2: Medium search around best candidate
ROTATION_MEDIUM_RANGE_DEG = 30  # ±40° around best
ROTATION_MEDIUM_STEP_DEG = 30   # Every 20°

# Level 3: Fine search around best candidate
ROTATION_FINE_RANGE_DEG = 10    # ±15° around best
ROTATION_FINE_STEP_DEG = 10    # Every 5°

# =============================================================================
# ICP REFINEMENT - Multi-start parameters
# =============================================================================
NUM_ICP_STARTS = 2      # Number of random initializations
ICP_MAX_ITERATIONS = 150  # Maximum iterations per ICP run
ICP_RANDOM_SEED = 12345  # Seed for reproducible random starts

# =============================================================================
# NUMERICAL STABILITY - Thresholds and tolerances
# =============================================================================
MIN_SURFACE_AREA = 1e-12  # Minimum area for valid surface centroid
MIN_TOTAL_AREA = 1e-9     # Minimum area for valid mesh sampling
MIN_VOLUME = 1e-9         # Minimum volume for metric computation
MIN_BBOX_NORM = 1e-9      # Minimum bounding box norm for metric computation
WEIGHT_SUM_TOLERANCE = 1e-6  # Tolerance for weight sum validation

# =============================================================================
# GEOMETRY VALIDATION
# =============================================================================
MIN_DIAGONAL = 1e-9  # Minimum scene diagonal (fallback to 1.0 if smaller)

# =============================================================================
# RELATIVE DIFFERENCE CAP
# =============================================================================
RELATIVE_DIFF_CAP = 1.0  # Maximum capped relative difference for similarity scoring