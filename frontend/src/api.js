// Auto-detect backend based on frontend environment
function getBackendBase() {
  const hostname = window.location.hostname;
  
  // Production: mesh-metrics.vercel.app → use Render backend
  if (hostname.includes("vercel.app") || hostname.includes("mesh-metrics.com")) {
    return "https://mesh-metrics.onrender.com";
  }
  
  // Development: localhost:5173 or localhost:3000 → use local backend
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }
  
  // Fallback: assume production
  return "https://mesh-metrics.onrender.com";
}

const BACKEND_BASE = getBackendBase();
const BACKEND_URL = `${BACKEND_BASE}/compare`;
const BACKEND_ALIGN = `${BACKEND_BASE}/align`;

console.info(`🔧 Backend configured: ${BACKEND_BASE} (frontend: ${window.location.hostname})`);

export async function computeSimilarity(fileA, fileB, weights, sharpness) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);
  form.append("weights", JSON.stringify(weights));
  form.append("sharpness", JSON.stringify(sharpness));

  console.info("📤 Calling computeSimilarity:", BACKEND_URL);
  
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const msg = await res.text();
    console.error("❌ API error:", res.status, msg);
    throw new Error("API error: " + msg);
  }

  const json = await res.json();
  console.info("✅ computeSimilarity response:", json);
  return json;
}

export async function computeAlignment(fileA, fileB) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);

  console.info("📤 Calling computeAlignment:", BACKEND_ALIGN);
  
  const res = await fetch(BACKEND_ALIGN, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    console.error("❌ Align API error:", res.status, msg);
    throw new Error("Align API error: " + msg);
  }

  const json = await res.json();
  console.info("✅ computeAlignment response:", json);
  return json;
}