import { useState } from "react";
import { computeSimilarity } from "./api";
import "./App.css";
import STLViewer from "./STLViewer";

export default function App() {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

  const [weights, setWeights] = useState({
    chamfer: 0.50,
    volume: 0.25,
    area: 0.15,
    bbox: 0.05,
    maxdist: 0.05,
  });

  function updateWeight(key, value) {
    setWeights((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }

  function validateWeightSum(weights) {
    const total = 
      weights.chamfer + 
      weights.volume + 
      weights.area + 
      weights.bbox + 
      weights.maxdist;

    return Math.abs(total - 1.0) < 1e-6;
  }

  async function handleCompare() {
    if (!fileA || !fileB) {
      setStatus("Please upload both STL files.");
      return;
    }

    if (!validateWeightSum(weights)) {
      const total =
        weights.chamfer +
        weights.volume +
        weights.area +
        weights.bbox +
        weights.maxdist;

      setStatus(`Weight sum must equal 1.0. Current total = ${total.toFixed(3)}`);
      return;
    }

    setStatus("Computing similarity...");
    setResult(null);

    try {
      const response = await computeSimilarity(fileA, fileB, weights);
      setResult(response);
      setStatus("Done!");
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div className="app-container">
      <div className="app-card">
        <h2 className="app-title">Instant STL Similarity Checker</h2>

        <div className="file-uploads">
          <div className="file-upload-box">
            <p className="file-label">STL File A:</p>
            <input type="file" accept=".stl" onChange={(e) => setFileA(e.target.files[0])} className="file-input" />
          </div>

          <div className="file-upload-box">
            <p className="file-label">STL File B:</p>
            <input type="file" accept=".stl" onChange={(e) => setFileB(e.target.files[0])} className="file-input" />
          </div>
        </div>

        <div className="file-viewers">
          <div className="viewer-box">
            <h4>Preview A</h4>
            <STLViewer file={fileA} />
          </div>

          <div className="viewer-box">
            <h4>Preview B</h4>
            <STLViewer file={fileB} />
          </div>
        </div>

        <h3 className="weights-title">Metric Weights</h3>

        <div className="weights-container">
          <div className="weight-item">
            <label className="weight-label">
              <span>Chamfer</span>
              <span className="weight-value">{weights.chamfer}</span>
            </label>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.chamfer}
              onChange={(e) => updateWeight("chamfer", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Volume</span>
              <span className="weight-value">{weights.volume}</span>
            </label>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.volume}
              onChange={(e) => updateWeight("volume", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Area</span>
              <span className="weight-value">{weights.area}</span>
            </label>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.area}
              onChange={(e) => updateWeight("area", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>BBox</span>
              <span className="weight-value">{weights.bbox}</span>
            </label>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.bbox}
              onChange={(e) => updateWeight("bbox", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Max Dist</span>
              <span className="weight-value">{weights.maxdist}</span>
            </label>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.maxdist}
              onChange={(e) => updateWeight("maxdist", e.target.value)} 
              className="weight-slider" />
          </div>
        </div>

        <button onClick={handleCompare} className="compare-button">Compare</button>

        <p className="status-text">{status}</p>

        {result && (
          <div className="results-box">
            <h3 className="results-title">Results:</h3>
            <p className="results-overall">Overall: {result.overall_similarity}</p>
            <pre className="results-json">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}