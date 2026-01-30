import { useState } from "react";
import { computeSimilarity, executeCadQuery } from "./api";
import "./App.css";
import VisualCompare from "./VisualCompare";
import { computeAlignment } from "./api";

export default function App() {
  // 🟢 Phase 1: New state structure (GT + candidates)
  const [gtFile, setGtFile] = useState(null);
  const [gtCentroid, setGtCentroid] = useState(null);
  const [candidates, setCandidates] = useState([]);
  // { id, file, alignment?, centroid?, metrics? }
  const [activeCandidateId, setActiveCandidateId] = useState(null);
  
  // CadQuery code input mode
  const [gtMode, setGtMode] = useState('file'); // 'file' or 'code'
  const [gtCode, setGtCode] = useState('');
  const [gtGeneratedFile, setGtGeneratedFile] = useState(null); // Stores generated STL from CadQuery
  const [candidateCode, setCandidateCode] = useState('');
  
  // Modal/popup state for adding candidates
  const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
  const [addCandidateMethod, setAddCandidateMethod] = useState(null); // 'file' or 'code'
  
  // Legacy state (will be removed in Phase 2)
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  
  // Computed values from new state structure
  const fileA = gtMode === 'file' ? gtFile : gtGeneratedFile;
  const fileB = candidates.find(c => c.id === activeCandidateId)?.file || null;
  const alignment = candidates.find(c => c.id === activeCandidateId)?.alignment || null;
  const surfaceCentroidA = gtCentroid;
  const surfaceCentroidB = candidates.find(c => c.id === activeCandidateId)?.centroid || null;

  const [weights, setWeights] = useState({
    "chamfer": 0.6,
    "volume": 0.2,
    "area":   0.15,
    "bbox":   0.0,
    "maxdist":0.05,
  });

  const [strictness, setStrictness] = useState({
    chamfer: 50,
    maxdist: 50,
  });

  function updateWeight(key, value) {
    setWeights((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }

  function updateStrictness(key, value) {
    setStrictness((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }

  function strictnessToSharpness(strictnessPercent) {
    return 1 + (strictnessPercent / 100) * 19;
  }

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

  async function handleAddCandidateFromCode() {
    console.log("🔵 handleAddCandidateFromCode called");
    
    if (!candidateCode.trim()) {
      console.log("❌ No code entered");
      setStatus("Please enter CadQuery code.");
      return;
    }
    
    console.log("✅ Code length:", candidateCode.length);
    setIsLoading(true);
    setLoadingLabel("Executing CadQuery code...");
    
    try {
      console.log("🚀 Calling executeCadQuery...");
      // Execute CadQuery code and get STL blob
      const stlBlob = await executeCadQuery(candidateCode);
      
      console.log("✅ STL blob received, size:", stlBlob.size);
      
      const newId = Date.now().toString();
      // Create a File from the blob
      const codeFile = new File([stlBlob], `cadquery_${newId}.stl`, { type: 'model/stl' });
      
      console.log("✅ File created:", codeFile.name);
      
      // Store the candidate with the code
      setCandidates(prev => {
        const updated = [...prev, { 
          id: newId, 
          file: codeFile, 
          isCadQuery: true,
          code: candidateCode // Store the code with the candidate
        }];
        console.log("✅ Candidates updated, new count:", updated.length);
        return updated;
      });
      setActiveCandidateId(newId);
      console.log("✅ Active candidate set to:", newId);
      
      // Don't clear the textarea - keep the code visible
      setStatus(`✓ Added candidate from CadQuery code`);
      console.log("✅ handleAddCandidateFromCode completed successfully");
    } catch (err) {
      console.error("❌ Error in handleAddCandidateFromCode:", err);
      setStatus(`CadQuery error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleUpdateCandidateFromCode() {
    console.log("🔵 handleUpdateCandidateFromCode called");
    
    if (!candidateCode.trim()) {
      console.log("❌ No code entered");
      setStatus("Please enter CadQuery code.");
      return;
    }
    
    if (!activeCandidateId) {
      console.log("❌ No active candidate to update");
      setStatus("No candidate selected to update.");
      return;
    }
    
    console.log("✅ Updating candidate:", activeCandidateId);
    setIsLoading(true);
    setLoadingLabel("Re-executing CadQuery code...");
    
    try {
      console.log("🚀 Calling executeCadQuery...");
      // Execute CadQuery code and get STL blob
      const stlBlob = await executeCadQuery(candidateCode);
      
      console.log("✅ STL blob received, size:", stlBlob.size);
      
      // Create a new File from the blob
      const codeFile = new File([stlBlob], `cadquery_${activeCandidateId}.stl`, { type: 'model/stl' });
      
      console.log("✅ File created:", codeFile.name);
      
      // Update the existing candidate
      setCandidates(prev => {
        const updated = prev.map(c => 
          c.id === activeCandidateId 
            ? { ...c, file: codeFile, code: candidateCode }
            : c
        );
        console.log("✅ Candidate updated");
        return updated;
      });
      
      setStatus(`✓ Updated candidate from CadQuery code`);
      console.log("✅ handleUpdateCandidateFromCode completed successfully");
    } catch (err) {
      console.error("❌ Error in handleUpdateCandidateFromCode:", err);
      setStatus(`CadQuery error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleGenerateGtFromCode() {
    if (!gtCode.trim()) {
      setStatus("Please enter CadQuery code.");
      return;
    }
    
    setIsLoading(true);
    setLoadingLabel("Generating GT from CadQuery code...");
    
    try {
      // Execute CadQuery code and get STL blob
      const stlBlob = await executeCadQuery(gtCode);
      
      // Create a File from the blob
      const codeFile = new File([stlBlob], `gt_cadquery.stl`, { type: 'model/stl' });
      setGtGeneratedFile(codeFile);
      setStatus(`✓ GT generated from CadQuery code`);
    } catch (err) {
      setStatus(`CadQuery error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleCompare() {
    // Check if we have files/code
    const hasGT = gtMode === 'file' ? fileA : gtCode.trim();
    const hasCandidate = fileB;
    
    if (!hasGT || !hasCandidate) {
      setStatus("Please provide both GT and candidate.");
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
    setIsLoading(true);
    setLoadingLabel("Calculating similarity");
    setResult(null);

    try {
      // Handle GT: execute CadQuery if needed
      let gtFileToSend = fileA;
      if (gtMode === 'code' && gtCode.trim()) {
        setLoadingLabel("Executing GT CadQuery code...");
        gtFileToSend = await executeCadQuery(gtCode);
      }

      // Handle candidate: already a file (could be STL or CadQuery-generated)
      const candidateFileToSend = fileB;

      setLoadingLabel("Calculating similarity");
      const sharpness = getSharpnessFromStrictness();
      const response = await computeSimilarity(gtFileToSend, candidateFileToSend, weights, sharpness);
      setResult(response);
      setStatus("Done!");
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleAutoAlign() {
    // Check if we have files/code
    const hasGT = gtMode === 'file' ? fileA : gtCode.trim();
    const hasCandidate = fileB;
    
    if (!hasGT || !hasCandidate) {
      setStatus("Please provide both GT and candidate.");
      return;
    }

    setStatus("Computing alignment...");
    setIsLoading(true);
    setLoadingLabel("Aligning models");
    
    try {
      // Handle GT: execute CadQuery if needed
      let gtFileToSend = fileA;
      if (gtMode === 'code' && gtCode.trim()) {
        setLoadingLabel("Executing GT CadQuery code...");
        gtFileToSend = await executeCadQuery(gtCode);
      }

      const alignResult = await computeAlignment(gtFileToSend, fileB);
      console.log("📍 Alignment result:", alignResult);
      
      // Store GT centroid
      setGtCentroid(alignResult.centroidA || null);
      
      // Update the active candidate with alignment data
      setCandidates(prev => 
        prev.map(c => 
          c.id === activeCandidateId 
            ? { 
                ...c, 
                alignment: alignResult.transform,
                centroid: alignResult.centroidB || null 
              }
            : c
        )
      );
      
      setStatus("Models aligned!");
    } catch (err) {
      setStatus(`Alignment error: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setLoadingLabel("");
    }
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <h2 className="app-title">STL Similarity & Visual Comparison Tool</h2>
        <p className="app-subtitle">Upload, overlay, tune weights, and measure alignment quality.</p>
      </div>

      <div className="app-grid">
        <div className="app-left">
          <div className="file-uploads">
            {/* 🟢 Phase 2: GT upload (single file) or CadQuery code */}
            <div className="file-upload-box">
              <div className="input-mode-header">
                <p className="file-label">Ground Truth (GT):</p>
                <div className="mode-toggle">
                  <button 
                    className={`mode-button ${gtMode === 'file' ? 'active' : ''}`}
                    onClick={() => {
                      // Only allow switching to file mode if no CadQuery code
                      if (!gtCode.trim()) {
                        setGtMode('file');
                      }
                    }}
                    disabled={gtCode.trim().length > 0}
                    title={gtCode.trim() ? "Clear CadQuery code first to upload a file" : "Upload STL file"}
                  >
                    📁 File
                  </button>
                  <button 
                    className={`mode-button ${gtMode === 'code' ? 'active' : ''}`}
                    onClick={() => {
                      // Only allow switching to code mode if no file is uploaded
                      if (!gtFile && !gtGeneratedFile) {
                        setGtMode('code');
                      }
                    }}
                    disabled={gtFile !== null || gtGeneratedFile !== null}
                    title={gtFile || gtGeneratedFile ? "Clear the uploaded file first to use CadQuery mode" : "Use CadQuery code"}
                  >
                    💻 CadQuery
                  </button>
                </div>
              </div>

              {gtMode === 'file' ? (
                <>
                  <input 
                    type="file" 
                    accept=".stl" 
                    onChange={(e) => {
                      const file = e.target.files[0];
                      setGtFile(file);
                      // Clear generated file if switching to upload
                      if (file) {
                        setGtGeneratedFile(null);
                        setGtCode('');
                      }
                    }} 
                    className="file-input" 
                  />
                  {(gtFile || gtGeneratedFile) && (
                    <div className="file-name-row">
                      <p className="file-name">✓ {gtFile?.name || "Generated from CadQuery"}</p>
                      <button 
                        className="clear-file-button"
                        onClick={() => {
                          setGtFile(null);
                          setGtGeneratedFile(null);
                        }}
                        title="Clear file"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <textarea
                    className="cadquery-input"
                    placeholder="Enter CadQuery code here...&#10;Example:&#10;import cadquery as cq&#10;result = cq.Workplane('XY').box(10, 10, 10)"
                    value={gtCode}
                    onChange={(e) => setGtCode(e.target.value)}
                    rows={8}
                  />
                  <button 
                    className="add-candidate-button"
                    onClick={handleGenerateGtFromCode}
                    disabled={!gtCode.trim()}
                  >
                    🔄 Generate Preview
                  </button>
                  {gtGeneratedFile && <p className="file-name">✓ Preview ready</p>}
                </>
              )}
            </div>

            {/* 🟢 Phase 2: Candidate management */}
            <div className="file-upload-box">
              <p className="file-label">Candidates:</p>
              
              {/* Show existing candidates with buttons */}
              {candidates.length > 0 && (
                <div className="candidate-list">
                  {candidates.map((candidate, index) => (
                    <button
                      key={candidate.id}
                      onClick={() => {
                        setActiveCandidateId(candidate.id);
                        // If it's a CadQuery candidate, load its code
                        if (candidate.isCadQuery && candidate.code) {
                          setCandidateCode(candidate.code);
                        }
                      }}
                      className={`candidate-button ${candidate.id === activeCandidateId ? 'active' : ''}`}
                    >
                      {candidate.isCadQuery ? '💻 ' : '📁 '}
                      Candidate {index + 1}
                      {candidate.id === activeCandidateId && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Add Candidate button - opens modal */}
              <button 
                className="add-candidate-button"
                onClick={() => setShowAddCandidateModal(true)}
              >
                + Add Candidate
              </button>
              
              {/* Show active candidate info */}
              {fileB && (
                <p className="file-name">
                  Active: {fileB.name}
                  {candidates.find(c => c.id === activeCandidateId)?.isCadQuery && 
                    ` (${candidates.find(c => c.id === activeCandidateId)?.code?.length || 0} chars)`
                  }
                </p>
              )}
              
              {/* Update button for CadQuery candidates */}
              {candidates.find(c => c.id === activeCandidateId)?.isCadQuery && (
                <div style={{ marginTop: '0.5rem' }}>
                  <textarea
                    className="cadquery-input"
                    placeholder="Edit CadQuery code..."
                    value={candidateCode}
                    onChange={(e) => setCandidateCode(e.target.value)}
                    rows={6}
                  />
                  <button 
                    className="add-candidate-button update-button"
                    onClick={handleUpdateCandidateFromCode}
                    disabled={!candidateCode.trim()}
                    style={{ marginTop: '0.5rem' }}
                  >
                    � Update This Candidate
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="visual-compare-container">
            <VisualCompare
              fileA={fileA}
              fileB={fileB}
              transformB={alignment}
              centroidA={surfaceCentroidA}
              centroidB={surfaceCentroidB}
              onAlign={handleAutoAlign}
              isLoading={isLoading}
              loadingLabel={loadingLabel}
            />
          </div>
        </div>

        <div className="app-right">
          <div className="sidebar-panel">
            <div className="sidebar-header">
              <span className="sidebar-dot" />
              <span className="sidebar-dot" />
              <span className="sidebar-dot" />
              <h3>Parameters</h3>
            </div>

            <div className="sidebar-section">
              <h4 className="weights-title">Metric Weights</h4>
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
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={weights.chamfer}
                    onChange={(e) => updateWeight("chamfer", e.target.value)} 
                    className="weight-slider" 
                  />
                </div>

                <div className="weight-item">
                  <label className="weight-label">
                    <span>Volume Difference</span>
                    <span className="weight-value">{weights.volume}</span>
                  </label>
                  <p className="weight-description">Compares the internal volume of both models</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={weights.volume}
                    onChange={(e) => updateWeight("volume", e.target.value)} 
                    className="weight-slider" 
                  />
                </div>

                <div className="weight-item">
                  <label className="weight-label">
                    <span>Surface Area</span>
                    <span className="weight-value">{weights.area}</span>
                  </label>
                  <p className="weight-description">Evaluates the difference in total surface area</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={weights.area}
                    onChange={(e) => updateWeight("area", e.target.value)} 
                    className="weight-slider" 
                  />
                </div>

                <div className="weight-item">
                  <label className="weight-label">
                    <span>Bounding Box</span>
                    <span className="weight-value">{weights.bbox}</span>
                  </label>
                  <p className="weight-description">Compares the overall dimensions and extents</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={weights.bbox}
                    onChange={(e) => updateWeight("bbox", e.target.value)} 
                    className="weight-slider" 
                  />
                </div>

                <div className="weight-item">
                  <label className="weight-label">
                    <span>Maximum Distance</span>
                    <span className="weight-value">{weights.maxdist}</span>
                  </label>
                  <p className="weight-description">Measures the largest deviation between surfaces</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={weights.maxdist}
                    onChange={(e) => updateWeight("maxdist", e.target.value)} 
                    className="weight-slider" 
                  />
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <h4 className="weights-title">Strictness Settings</h4>

              <div className="weights-container">
                <div className="weight-item sharpness-item">
                  <label className="weight-label">
                    <span>Chamfer Distance Strictness</span>
                    <span className="weight-value">{strictness.chamfer}%</span>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="1"
                    value={strictness.chamfer}
                    onChange={(e) => updateStrictness("chamfer", e.target.value)} 
                    className="weight-slider sharpness-slider" 
                  />
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
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="1"
                    value={strictness.maxdist}
                    onChange={(e) => updateStrictness("maxdist", e.target.value)} 
                    className="weight-slider sharpness-slider" 
                  />
                  <div className="sharpness-scale">
                    <span>Very Forgiving (0%)</span>
                    <span>Moderate (50%)</span>
                    <span>Very Strict (100%)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="sidebar-actions">
              <button
                onClick={handleCompare}
                className="compare-button"
                disabled={isLoading || !validateWeightSum(weights)}
              >
                {isLoading ? "Working..." : "Calculate Similarity"}
              </button>
              {!validateWeightSum(weights) && !isLoading && (
                <p className="weight-warning">
                  ⚠ Weights must sum to 1.0 (current: {(weights.chamfer + weights.volume + weights.area + weights.bbox + weights.maxdist).toFixed(3)})
                </p>
              )}
              {isLoading && (
                <div className="loading-indicator" aria-live="polite">
                  <div className="loading-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="loading-text">{loadingLabel || "Processing"}</span>
                </div>
              )}
              <p className="status-text">{status}</p>
            </div>

          </div>
        </div>
      </div>
      {result && (
        <div className="results-row">
          <div className="results-box">
            <h3 className="results-title">Results:</h3>
            <p className="results-overall">
              Overall Similarity: {(result.overall_similarity * 100).toFixed(2)}%
            </p>
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
        </div>
      )}
      
      {/* Modal for adding candidate */}
      {showAddCandidateModal && (
        <div className="modal-overlay" onClick={() => setShowAddCandidateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Add New Candidate</h3>
            <p className="modal-subtitle">Choose how you want to add the candidate:</p>
            
            <div className="modal-options">
              {/* File Upload Option */}
              <label className="modal-option-card">
                <input
                  type="file"
                  accept=".stl"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const newId = Date.now().toString();
                      setCandidates(prev => [...prev, { id: newId, file, isCadQuery: false }]);
                      setActiveCandidateId(newId);
                      setShowAddCandidateModal(false);
                    }
                    e.target.value = '';
                  }}
                />
                <div className="modal-option-icon">📁</div>
                <div className="modal-option-title">Upload STL File</div>
                <div className="modal-option-description">Upload an existing STL file from your computer</div>
              </label>
              
              {/* CadQuery Code Option */}
              <button 
                className="modal-option-card"
                onClick={() => {
                  setAddCandidateMethod('code');
                  setShowAddCandidateModal(false);
                  setCandidateCode(''); // Clear code for new candidate
                }}
              >
                <div className="modal-option-icon">💻</div>
                <div className="modal-option-title">Write CadQuery Code</div>
                <div className="modal-option-description">Generate STL from CadQuery Python code</div>
              </button>
            </div>
            
            <button className="modal-close-button" onClick={() => setShowAddCandidateModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* CadQuery code input panel */}
      {addCandidateMethod === 'code' && (
        <div className="modal-overlay" onClick={() => setAddCandidateMethod(null)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">💻 CadQuery Code</h3>
            <p className="modal-subtitle">Enter your CadQuery code below:</p>
            
            <textarea
              className="cadquery-input"
              placeholder="import cadquery as cq&#10;&#10;# Create a simple box&#10;result = cq.Workplane('XY').box(10, 10, 10)&#10;&#10;# Or use 'shaft', 'part', etc. as variable name"
              value={candidateCode}
              onChange={(e) => setCandidateCode(e.target.value)}
              rows={15}
              autoFocus
            />
            
            <div className="modal-actions">
              <button 
                className="modal-cancel-button"
                onClick={() => {
                  setAddCandidateMethod(null);
                  setCandidateCode('');
                }}
              >
                Cancel
              </button>
              <button 
                className="modal-execute-button"
                onClick={() => {
                  handleAddCandidateFromCode();
                  setAddCandidateMethod(null);
                }}
                disabled={!candidateCode.trim()}
              >
                🚀 Execute & Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}