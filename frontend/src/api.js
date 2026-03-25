// ── Backend targets ──────────────────────────────────────────────
const RAILWAY_BACKEND = "https://mesh-metrics-production.up.railway.app";
const RENDER_BACKEND  = "https://mesh-metrics.onrender.com";
const LOCAL_BACKEND   = "http://localhost:8000";

// ── Pick primary backend based on where the frontend is running ─
function getBackendBase() {
  const hostname = window.location.hostname;

  // Local development → local backend (no fallback needed)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_BACKEND;
  }

  // Production (Vercel / custom domain / anything else) → Railway first
  return RAILWAY_BACKEND;
}

// ── Automatic Railway → Render fallback ─────────────────────────
// If the request targets Railway and fails (network error OR HTTP 5xx),
// retry the same request against Render once.
async function fetchWithFallback(url, options) {
  try {
    const res = await fetch(url, options);

    // Railway responded but with a server error → fall back
    if (!res.ok && url.includes("railway.app")) {
      throw new Error(`Railway returned ${res.status}`);
    }

    return res;
  } catch (err) {
    // Only fall back when the original target was Railway
    if (url.includes("railway.app")) {
      console.warn("⚠️ Railway unavailable, falling back to Render:", err.message);

      const fallbackUrl = url.replace(
        "mesh-metrics-production.up.railway.app",
        "mesh-metrics.onrender.com"
      );

      return fetch(fallbackUrl, options);
    }

    // Local or other host — no fallback, just re-throw
    throw err;
  }
}

const BACKEND_BASE    = getBackendBase();
const BACKEND_URL     = `${BACKEND_BASE}/compare`;
const BACKEND_ALIGN   = `${BACKEND_BASE}/align`;
const BACKEND_CADQUERY = `${BACKEND_BASE}/cadquery`;
const BACKEND_PREPARE = `${BACKEND_BASE}/mesh/prepare`;

console.info(`🔧 Backend configured: ${BACKEND_BASE} (frontend: ${window.location.hostname})`);

export async function computeSimilarity(fileA, fileB, weights, sharpness) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);
  form.append("weights", JSON.stringify(weights));
  form.append("sharpness", JSON.stringify(sharpness));

  console.info("📤 Calling computeSimilarity:", BACKEND_URL);

  const res = await fetchWithFallback(BACKEND_URL, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    console.error("❌ API error:", res.status, msg);
    
    // Try to parse error message from backend JSON
    try {
      const errorJson = JSON.parse(msg);
      const errorMessage = errorJson.message || errorJson.error || msg;
      throw new Error(`Backend error (${res.status}): ${errorMessage}`);
    } catch (parseError) {
      throw new Error(`Backend error (${res.status}): ${msg}`);
    }
  }

  const json = await res.json();
  
  // Check if the response contains an error even with 200 status
  if (json.error) {
    console.error("❌ Similarity returned error:", json);
    throw new Error(`Similarity computation failed: ${json.error}`);
  }
  
  console.info("✅ computeSimilarity response:", json);
  return json;
}

export async function computeAlignment(fileA, fileB) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);

  console.info("📤 Calling computeAlignment:", BACKEND_ALIGN);

  const res = await fetchWithFallback(BACKEND_ALIGN, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    console.error("❌ Align API error:", res.status, msg);
    
    // Try to parse error message from backend JSON
    try {
      const errorJson = JSON.parse(msg);
      const errorMessage = errorJson.message || errorJson.error || msg;
      throw new Error(`Alignment error (${res.status}): ${errorMessage}`);
    } catch (parseError) {
      throw new Error(`Alignment error (${res.status}): ${msg}`);
    }
  }

  const json = await res.json();
  
  // Check if the response contains an error even with 200 status
  if (json.status === "error") {
    console.error("❌ Alignment returned error:", json);
    throw new Error(`Alignment failed: ${json.message || "Unknown error"}`);
  }
  
  console.info("✅ computeAlignment response:", json);
  return json;
}

export async function executeCadQuery(code) {
  console.info("📤 Calling executeCadQuery:", BACKEND_CADQUERY);
  
  try {
    const res = await fetchWithFallback(BACKEND_CADQUERY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

    console.info("📡 Response status:", res.status);
    console.info("📡 Response headers:", Object.fromEntries(res.headers.entries()));

    // Check content type to determine if it's an error or STL
    const contentType = res.headers.get("content-type");
    console.info("📡 Content-Type:", contentType);

    if (!res.ok) {
      const msg = await res.text();
      console.error("❌ CadQuery API error:", res.status, msg);
      
      // Try to parse error message from backend JSON
      try {
        const errorJson = JSON.parse(msg);
        const errorMessage = errorJson.message || errorJson.error || msg;
        throw new Error(`CadQuery error (${res.status}): ${errorMessage}`);
      } catch (parseError) {
        throw new Error(`CadQuery error (${res.status}): ${msg}`);
      }
    }

    // Check if response is JSON (error) even with 200 status
    if (contentType && contentType.includes("application/json")) {
      const errorJson = await res.json();
      console.error("❌ CadQuery returned error:", errorJson);
      const errorMessage = errorJson.message || errorJson.error || "Unknown CadQuery error";
      throw new Error(`CadQuery execution failed: ${errorMessage}`);
    }

    // Response should be STL file bytes
    const blob = await res.blob();
    console.info("✅ executeCadQuery response: STL file received, size:", blob.size, "bytes");
    return blob;
  } catch (error) {
    console.error("❌ executeCadQuery failed:", error);
    throw error;
  }
}

export async function prepareMeshForViewer(file) {
  const form = new FormData();
  form.append("file", file);

  console.info("📤 Calling prepareMeshForViewer:", BACKEND_PREPARE, "for", file?.name);

  const res = await fetchWithFallback(BACKEND_PREPARE, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    try {
      const errorJson = JSON.parse(msg);
      const errorMessage = errorJson.message || errorJson.error || msg;
      throw new Error(`Mesh preparation error (${res.status}): ${errorMessage}`);
    } catch {
      throw new Error(`Mesh preparation error (${res.status}): ${msg}`);
    }
  }

  const stlBlob = await res.blob();
  const baseName = (file?.name || "model").replace(/\.[^/.]+$/, "");
  return new File([stlBlob], `${baseName}.stl`, { type: "model/stl" });
}