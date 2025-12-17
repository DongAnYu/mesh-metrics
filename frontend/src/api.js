const BACKEND_URL_DEV = "http://localhost:8000/compare";
const BACKEND_URL_PRO = "https://mesh-metrics.onrender.com/compare"

export async function computeSimilarity(fileA, fileB, weights, sharpness) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);
  form.append("weights", JSON.stringify(weights));
  form.append("sharpness", JSON.stringify(sharpness));


  const res = await fetch(BACKEND_URL_PRO, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error("API error: " + msg);
  }

  return await res.json();
}

const BACKEND_ALIGN_DEV = "http://localhost:8000/align";
const BACKEND_ALIGN_PRO = "https://mesh-metrics.onrender.com/align";

export async function computeAlignment(fileA, fileB) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);

  const res = await fetch(BACKEND_ALIGN_PRO, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error("Align API error: " + msg);
  }

  return await res.json(); // { transform: [[...]], status }
}