// ── Backend Configuration ───────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const FALLBACK_API_BASE = import.meta.env.VITE_FALLBACK_API_URL || "http://localhost:8000";

const API = {
  compare: "/compare",
  align: "/align",
  cadquery: "/cadquery",
  prepare: "/mesh/prepare",
};

console.info(
  `🔧 Backend configured: ${API_BASE}` +
  (FALLBACK_API_BASE ? ` (fallback: ${FALLBACK_API_BASE})` : "")
);

// ── Generic Fetch With Optional Fallback ────────────────────────

async function fetchWithFallback(path, options) {
  const primaryUrl = `${API_BASE}${path}`;

  try {
    const res = await fetch(primaryUrl, options);

    // Success
    if (res.ok) {
      return res;
    }

    // No fallback configured
    if (!FALLBACK_API_BASE) {
      return res;
    }

    // Retry on server-side failure
    if (res.status >= 500) {
      throw new Error(`Primary backend returned ${res.status}`);
    }

    return res;

  } catch (err) {
    if (!FALLBACK_API_BASE) {
      throw err;
    }

    console.warn(
      "⚠️ Primary backend unavailable, falling back:",
      err.message
    );

    const fallbackUrl = `${FALLBACK_API_BASE}${path}`;

    return fetch(fallbackUrl, options);
  }
}

// ── Shared Error Parser ─────────────────────────────────────────

async function parseErrorResponse(res, prefix = "Backend error") {
  const msg = await res.text();

  try {
    const errorJson = JSON.parse(msg);

    throw new Error(
      `${prefix} (${res.status}): ${
        errorJson.message ||
        errorJson.error ||
        msg
      }`
    );
  } catch {
    throw new Error(`${prefix} (${res.status}): ${msg}`);
  }
}

// ── Similarity ──────────────────────────────────────────────────

export async function computeSimilarity(fileA, fileB, weights, sharpness) {
  const form = new FormData();

  form.append("fileA", fileA);
  form.append("fileB", fileB);
  form.append("weights", JSON.stringify(weights));
  form.append("sharpness", JSON.stringify(sharpness));

  console.info("📤 Calling computeSimilarity");

  const res = await fetchWithFallback(API.compare, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    await parseErrorResponse(res, "Similarity error");
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(
      `Similarity computation failed: ${json.error}`
    );
  }

  console.info("✅ computeSimilarity response:", json);

  return json;
}

// ── Alignment ───────────────────────────────────────────────────

export async function computeAlignment(fileA, fileB) {
  const form = new FormData();

  form.append("fileA", fileA);
  form.append("fileB", fileB);

  console.info("📤 Calling computeAlignment");

  const res = await fetchWithFallback(API.align, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    await parseErrorResponse(res, "Alignment error");
  }

  const json = await res.json();

  if (json.status === "error") {
    throw new Error(
      `Alignment failed: ${json.message || "Unknown error"}`
    );
  }

  console.info("✅ computeAlignment response:", json);

  return json;
}

// ── CadQuery ────────────────────────────────────────────────────

export async function executeCadQuery(code) {
  console.info("📤 Calling executeCadQuery");

  const res = await fetchWithFallback(API.cadquery, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    await parseErrorResponse(res, "CadQuery error");
  }

  const contentType = res.headers.get("content-type");

  if (
    contentType &&
    contentType.includes("application/json")
  ) {
    const errorJson = await res.json();

    throw new Error(
      `CadQuery execution failed: ${
        errorJson.message ||
        errorJson.error ||
        "Unknown error"
      }`
    );
  }

  const blob = await res.blob();

  console.info(
    "✅ STL generated:",
    blob.size,
    "bytes"
  );

  return blob;
}

// ── Mesh Preparation ────────────────────────────────────────────

export async function prepareMeshForViewer(file) {
  const form = new FormData();

  form.append("file", file);

  console.info(
    "📤 Calling prepareMeshForViewer:",
    file?.name
  );

  const res = await fetchWithFallback(API.prepare, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    await parseErrorResponse(
      res,
      "Mesh preparation error"
    );
  }

  const stlBlob = await res.blob();

  const baseName =
    (file?.name || "model").replace(/\.[^/.]+$/, "");

  return new File(
    [stlBlob],
    `${baseName}.stl`,
    {
      type: "model/stl",
    }
  );
}