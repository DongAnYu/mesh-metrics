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

function Model({ url, color, opacity, animating, phase }) {
  const meshRef = useRef();
  const geometry = useLoader(STLLoader, url);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!animating) return;
    
    const interval = setInterval(() => {
      setTime(t => t + 0.1);
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

export default function VisualCompare({ fileA, fileB }) {
  const [urlA, setUrlA] = useState(null);
  const [urlB, setUrlB] = useState(null);
  const [opacity, setOpacity] = useState(0.6);
  const [colorScheme, setColorScheme] = useState("green-red");
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (fileA) {
      const url = URL.createObjectURL(fileA);
      setUrlA(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [fileA]);

  useEffect(() => {
    if (fileB) {
      const url = URL.createObjectURL(fileB);
      setUrlB(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [fileB]);

  if (!fileA || !fileB) {
    return (
      <div className="visual-compare-placeholder">
        <p>Upload both STL files to see visual comparison</p>
      </div>
    );
  }

  const scheme = COLOR_SCHEMES[colorScheme];

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
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
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