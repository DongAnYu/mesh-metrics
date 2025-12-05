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

  // Strictness is 0-100, converted to sharpness 1-20 for backend
  const [strictness, setStrictness] = useState({
    chamfer: 50,    // 50% = moderate (sharpness 10)
    maxdist: 50,    // 50% = moderate (sharpness 10)
  });

  function updateWeight(key, value) {
    setWeights((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }

  function updateStrictness(key, value) {
    setStrictness((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }

  // Convert strictness percentage (0-100) to sharpness (1-20)
  function strictnessToSharpness(strictnessPercent) {
    // 0% = 1, 50% = 10, 100% = 20 (linear mapping)
    return 1 + (strictnessPercent / 100) * 19;
  }

  // Get sharpness values for backend
  function getSharpnessFromStrictness() {
    return {
      chamfer: strictnessToSharpness(strictness.chamfer),
      maxdist: strictnessToSharpness(strictness.maxdist),
    };
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
      const sharpness = getSharpnessFromStrictness();
      const response = await computeSimilarity(fileA, fileB, weights, sharpness);
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
        <p className="section-description">
          Control the importance of each metric (must sum to 1.0)
        </p>

        <div className="weights-container">
          <div className="weight-item">
            <label className="weight-label">
              <span>Chamfer Distance</span>
              <span className="weight-value">{weights.chamfer}</span>
            </label>
            <p className="weight-description">Measures point-to-point surface similarity between meshes</p>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.chamfer}
              onChange={(e) => updateWeight("chamfer", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Volume Difference</span>
              <span className="weight-value">{weights.volume}</span>
            </label>
            <p className="weight-description">Compares the internal volume of both models</p>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.volume}
              onChange={(e) => updateWeight("volume", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Surface Area</span>
              <span className="weight-value">{weights.area}</span>
            </label>
            <p className="weight-description">Evaluates the difference in total surface area</p>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.area}
              onChange={(e) => updateWeight("area", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Bounding Box</span>
              <span className="weight-value">{weights.bbox}</span>
            </label>
            <p className="weight-description">Compares the overall dimensions and extents</p>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.bbox}
              onChange={(e) => updateWeight("bbox", e.target.value)} 
              className="weight-slider" />
          </div>

          <div className="weight-item">
            <label className="weight-label">
              <span>Maximum Distance</span>
              <span className="weight-value">{weights.maxdist}</span>
            </label>
            <p className="weight-description">Measures the largest deviation between surfaces</p>
            <input type="range" min="0" max="1" step="0.01"
              value={weights.maxdist}
              onChange={(e) => updateWeight("maxdist", e.target.value)} 
              className="weight-slider" />
          </div>
        </div>

        <h3 className="weights-title">Strictness Settings</h3>
        <p className="section-description">
          Control how strictly differences are penalized (0% = very forgiving, 100% = very strict)
        </p>
        <div className="sharpness-explanation">
          <p><strong>Higher strictness</strong> = Small differences significantly lower similarity score</p>
          <p><strong>Lower strictness</strong> = More tolerant of differences between models</p>
          <p className="formula-note">Behind the scenes: similarity = e^(-distance × strictness_factor)</p>
        </div>

        <div className="weights-container">
          <div className="weight-item sharpness-item">
            <label className="weight-label">
              <span>Chamfer Distance Strictness</span>
              <span className="weight-value">{strictness.chamfer}%</span>
            </label>
            <p className="weight-description">
              Controls how strictly surface deviations are penalized. 
              At {strictness.chamfer}% strictness with distance=0.1, similarity = {(Math.exp(-0.1 * strictnessToSharpness(strictness.chamfer)) * 100).toFixed(1)}%
            </p>
            <input type="range" min="0" max="100" step="1"
              value={strictness.chamfer}
              onChange={(e) => updateStrictness("chamfer", e.target.value)} 
              className="weight-slider sharpness-slider" />
            <div className="sharpness-scale">
              <span>Very Forgiving (0%)</span>
              <span>Moderate (50%)</span>
              <span>Very Strict (100%)</span>
            </div>
          </div>

          <div className="weight-item sharpness-item">
            <label className="weight-label">
              <span>Max Distance Strictness</span>
              <span className="weight-value">{strictness.maxdist}%</span>
            </label>
            <p className="weight-description">
              Controls how strictly maximum deviations are penalized.
              At {strictness.maxdist}% strictness with distance=0.1, similarity = {(Math.exp(-0.1 * strictnessToSharpness(strictness.maxdist)) * 100).toFixed(1)}%
            </p>
            <input type="range" min="0" max="100" step="1"
              value={strictness.maxdist}
              onChange={(e) => updateStrictness("maxdist", e.target.value)} 
              className="weight-slider sharpness-slider" />
            <div className="sharpness-scale">
              <span>Very Forgiving (0%)</span>
              <span>Moderate (50%)</span>
              <span>Very Strict (100%)</span>
            </div>
          </div>
        </div>

        <button onClick={handleCompare} className="compare-button">Compare</button>

        <p className="status-text">{status}</p>

        {result && (
          <div className="results-box">
            <h3 className="results-title">Results:</h3>
            <p className="results-overall">Overall Similarity: {(result.overall_similarity * 100).toFixed(2)}%</p>
            <div className="metrics-grid">
              <div className="metric-card">
                <h4>Chamfer Similarity</h4>
                <p className="metric-value">{(result.metrics.chamfer_similarity * 100).toFixed(2)}%</p>
                <p className="metric-detail">Distance: {result.chamfer.toFixed(4)}</p>
              </div>
              <div className="metric-card">
                <h4>Volume Similarity</h4>
                <p className="metric-value">{(result.metrics.volume_similarity * 100).toFixed(2)}%</p>
              </div>
              <div className="metric-card">
                <h4>Area Similarity</h4>
                <p className="metric-value">{(result.metrics.area_similarity * 100).toFixed(2)}%</p>
              </div>
              <div className="metric-card">
                <h4>BBox Similarity</h4>
                <p className="metric-value">{(result.metrics.bbox_similarity * 100).toFixed(2)}%</p>
              </div>
              <div className="metric-card">
                <h4>Max Distance Similarity</h4>
                <p className="metric-value">{(result.metrics.maxdist_similarity * 100).toFixed(2)}%</p>
                <p className="metric-detail">Distance: {result.max_dist.toFixed(4)}</p>
              </div>
            </div>
            <details className="results-details">
              <summary>View Full JSON Response</summary>
              <pre className="results-json">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}