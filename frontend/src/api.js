export async function computeSimilarity(fileA, fileB, weights) {
  const form = new FormData();
  form.append("fileA", fileA);
  form.append("fileB", fileB);
  form.append("weights", JSON.stringify(weights));

  const res = await fetch("https://mesh-metrics.onrender.com/compare", {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error("API error: " + msg);
  }

  return await res.json();
}