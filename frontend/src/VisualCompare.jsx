import { useState, useEffect, useRef } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import "./VisualCompare.css";

const COLOR_SCHEMES = {
  "green-red": {
    name1: "Model A (Green)",
    name2: "Model B (Red)", 
    color1: new THREE.Color(0x00fa00),
    color2: new THREE.Color(0xfa0000)
  },
  "blue-orange": {
    name1: "Model A (Blue)",
    name2: "Model B (Orange)",
    color1: new THREE.Color(0x0064fa),
    color2: new THREE.Color(0xfaa500)
  },
  "purple-yellow": {
    name1: "Model A (Purple)", 
    name2: "Model B (Yellow)",
    color1: new THREE.Color(0x644bfa),
    color2: new THREE.Color(0xfafa00)
  }
};


function Model({ url, color, opacity, animating, phase, matrix }) {
  const meshRef = useRef();
  const geometry = useLoader(STLLoader, url);
  const [time, setTime] = useState(0);

  // Convert a nested row-major 4x4 matrix ([[r0],[r1],...]) to a
  // column-major flat array for three.js Matrix4.fromArray
  function rowMajorToColumnMajorFlat(m) {
    if (!Array.isArray(m)) return m;
    // accept either flat 16 array or 4x4 nested arrays
    if (m.length === 16 && !Array.isArray(m[0])) return m;
    const out = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        out[c * 4 + r] = m[r][c];
      }
    }
    return out;
  }

  // Reset position when matrix is removed or applied
  useEffect(() => {
    if (!meshRef.current) return;

    if (matrix) {
      try {
        // Apply transformation correctly
  const m = new THREE.Matrix4();
  const flat = rowMajorToColumnMajorFlat(matrix);
  m.fromArray(flat);
        
        // Decompose the matrix into position, rotation, and scale
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        m.decompose(position, quaternion, scale);
        
        // Apply to the mesh
        meshRef.current.position.copy(position);
        meshRef.current.quaternion.copy(quaternion);
        meshRef.current.scale.copy(scale);
        
        console.log("🔧 B centroid AFTER transform:", position.toArray());
      } catch (error) {
        console.error("Error applying transform:", error);
      }
    } else {
      // Reset to identity when matrix is null (show raw)
      meshRef.current.position.set(0, 0, 0);
      meshRef.current.quaternion.identity();
      meshRef.current.scale.set(1, 1, 1);
    }
  }, [matrix]);

  useEffect(() => {
    if (!animating) return;
    
    const interval = setInterval(() => {
      setTime(t => t + 0.05);
    }, 50);
    
    return () => clearInterval(interval);
  }, [animating]);

  const currentOpacity = animating 
    ? 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(time + phase))
    : opacity;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={currentOpacity}
        side={THREE.DoubleSide}
        depthWrite={opacity > 0.95}
        metalness={0.1}
        roughness={0.4}
      />
    </mesh>
  );
}

export default function VisualCompare({ fileA, fileB, transformB, onAlign  }) {
  const [urlA, setUrlA] = useState(null);
  const [urlB, setUrlB] = useState(null);
  const [opacity, setOpacity] = useState(0.3);
  const [colorScheme, setColorScheme] = useState("green-red");
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [alignStatus, setAlignStatus] = useState("");

  useEffect(() => {
    if (fileA) {
      const url = URL.createObjectURL(fileA);
      setUrlA(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setUrlA(null);
    }
  }, [fileA]);

  useEffect(() => {
    if (fileB) {
      const url = URL.createObjectURL(fileB);
      setUrlB(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setUrlB(null);
    }
  }, [fileB]);

  useEffect(() => {
    console.log("🧭 transformB in VisualCompare:", transformB);
  }, [transformB]);


  if (!fileA || !fileB) {
    return (
      <div className="visual-compare-placeholder">
        <p>Upload both STL files to see visual comparison</p>
      </div>
    );
  }

  const scheme = COLOR_SCHEMES[colorScheme];

  const handleAlign = async () => {
    if (!fileA || !fileB) return;
    
    setAlignStatus("Aligning...");
    try {
      await onAlign();
      setShowRaw(false);
      setAlignStatus("Aligned ✓");
    } catch (e) {
      setAlignStatus(`Error: ${e.message}`);
      console.error("Alignment error:", e);
    }
  };

  return (
    <div className="visual-compare">
      <div className="visual-compare-header">
        <div className="header-text">
          <h3>Visual Overlay Comparison</h3>
          <p>See differences highlighted in contrasting colors</p>
        </div>
      </div>

      <div className="visual-compare-controls">
        <div className="control-group">
          <label className="control-label">
            Opacity: {opacity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="control-slider"
          />
        </div>

        <div className="control-group">
          <label className="control-label">Color Scheme</label>
          <select 
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
            className="control-select"
          >
            <option value="green-red">Green / Red (Colorblind-friendly)</option>
            <option value="blue-orange">Blue / Orange</option>
            <option value="purple-yellow">Purple / Yellow</option>
          </select>
        </div>

        <div className="control-button-group">
          <button
            onClick={() => setShowA(!showA)}
            className={`control-button ${!showA ? "inactive" : ""}`}
          >
            {showA ? "Hide" : "Show"} A
          </button>
          <button
            onClick={() => setShowB(!showB)}
            className={`control-button ${!showB ? "inactive" : ""}`}
          >
            {showB ? "Hide" : "Show"} B
          </button>
          <button
            onClick={() => setAnimating(!animating)}
            className={`control-button animate-button ${animating ? "active" : ""}`}
          >
            {animating ? "⏸ Stop" : "▶ Animate"}
          </button>
        </div>

        <div className="control-button-group" style={{ marginTop: "12px" }}>
          <button
            onClick={handleAlign}
            className="control-button"
            style={{ 
              flex: 1,
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "white"
            }}
          >
            Auto-Align Models
          </button>
          {transformB && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              className={`control-button ${showRaw ? "active" : ""}`}
              style={{ flex: 1 }}
            >
              {showRaw ? "Show Aligned" : "Show Raw"}
            </button>
          )}
        </div>

        {alignStatus && (
          <div style={{ 
            marginTop: "8px", 
            padding: "8px 12px", 
            background: alignStatus.includes("✓") ? "#d1fae5" : alignStatus.includes("Error") ? "#fee2e2" : "#fef3c7",
            color: alignStatus.includes("✓") ? "#065f46" : alignStatus.includes("Error") ? "#991b1b" : "#92400e",
            borderRadius: "6px",
            fontSize: "14px",
            textAlign: "center"
          }}>
            {alignStatus}
          </div>
        )}
      </div>

      <div className="visual-compare-legend">
        <div className="legend-item">
          <div 
            className="legend-color-box" 
            style={{ backgroundColor: `#${scheme.color1.getHexString()}` }}
          />
          <span>{scheme.name1}</span>
        </div>
        <div className="legend-item">
          <div 
            className="legend-color-box" 
            style={{ backgroundColor: `#${scheme.color2.getHexString()}` }}
          />
          <span>{scheme.name2}</span>
        </div>
      </div>

      <div className="visual-compare-canvas">
        <Canvas 
          camera={{ position: [3, 3, 3], fov: 50 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            gl.setClearColor('#f0f0f0', 1);
          }}
        >
          <OrbitControls enableDamping dampingFactor={0.05} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />
          
          {urlA && showA && (
            <Model 
              url={urlA} 
              color={scheme.color1}
              opacity={opacity}
              animating={animating}
              phase={0}
            />
          )}
          {urlB && showB && (
            <Model
              url={urlB}
              color={scheme.color2}
              opacity={opacity}
              animating={animating}
              phase={Math.PI}
              matrix={showRaw ? null : transformB}
            />
          )}
        </Canvas>
      </div>

      <div className="visual-compare-info">
        <div className="info-box">
          <strong>💡 How to use:</strong>
          <ul>
            <li>Drag to rotate, scroll to zoom, right-click to pan</li>
            <li>Adjust opacity to see through overlapping areas</li>
            <li>Use "Animate" to flash between models and spot differences</li>
            <li>Toggle individual models on/off to isolate features</li>
          </ul>
        </div>
        <div className="info-box">
          <strong>🎨 Understanding the colors:</strong>
          <ul>
            <li>Pure colors = unique features in each model</li>
            <li>Mixed/blended colors = overlapping geometry</li>
            <li>Gray areas (if visible) = perfectly aligned surfaces</li>
          </ul>
        </div>
      </div>
    </div>
  );
}