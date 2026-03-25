import { useState, useEffect, useRef } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import "./VisualCompare.css";

const FIXED_OPACITY = 0.25; // Low opacity enables GPU alpha blending for grey overlaps

const COLOR_SCHEMES = {
  "green-magenta": {
    name1: "Model A (Green)",
    name2: "Model B (Magenta)", 
    color1: new THREE.Color(0x00fa00),
    color2: new THREE.Color(0xfa00fa)
  },
  "blue-orange": {
    name1: "Model A (Blue)",
    name2: "Model B (Orange)",
    color1: new THREE.Color(0x0064fa),
    color2: new THREE.Color(0xfa9b00)
  },
  "purple-yellow": {
    name1: "Model A (Purple)", 
    name2: "Model B (Yellow)",
    color1: new THREE.Color(0x644bfa),
    color2: new THREE.Color(0xfab500)
  }
};

// Arrow component to indicate worst discrepancy point
function DiscrepancyArrow({ position, diagonal }) {
  const arrowRef = useRef();
  const [time, setTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTime(t => t + 0.1), 50);
    return () => clearInterval(interval);
  }, []);

  // Calculate size based on diagonal - make arrow 2% of model size
  const arrowScale = diagonal ? diagonal * 0.02 : 1; // 2% of diagonal

  // Pulsing animation
  const pulseScale = 1 + 0.3 * Math.sin(time * 2);
  const arrowColor = new THREE.Color(0xff0000); // Bright red

  console.log("🎯 DiscrepancyArrow rendering - position:", position, "diagonal:", diagonal, "arrowScale:", arrowScale);

  return (
    <group ref={arrowRef} position={position}>
      {/* Small glowing sphere - main indicator (2% of diagonal) */}
      <mesh scale={pulseScale}>
        <sphereGeometry args={[arrowScale * 0.4, 32, 32]} />
        <meshBasicMaterial 
          color={arrowColor}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Subtle outer glow sphere */}
      <mesh scale={pulseScale * 1.3}>
        <sphereGeometry args={[arrowScale * 0.4, 32, 32]} />
        <meshBasicMaterial 
          color={arrowColor}
          transparent
          opacity={0.2}
        />
      </mesh>
      
      {/* Arrow pointing down from above */}
      <mesh position={[0, arrowScale * 2, 0]}>
        <cylinderGeometry args={[arrowScale * 0.08, arrowScale * 0.08, arrowScale * 3, 16]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>
      
      {/* Cone arrow head */}
      <mesh position={[0, arrowScale * 0.5, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[arrowScale * 0.3, arrowScale * 0.8, 16]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>
      
      {/* Thin pulsing ring for extra visibility */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={pulseScale}>
        <torusGeometry args={[arrowScale * 0.5, arrowScale * 0.05, 16, 32]} />
        <meshBasicMaterial 
          color={arrowColor}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}


function Model({ url, color, animating, phase, matrix, centroid }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const { camera } = useThree();
  const geometry = useLoader(STLLoader, url);
  const [time, setTime] = useState(0);
  const [transformedCentroid, setTransformedCentroid] = useState(null);

  // Convert a nested row-major 4x4 matrix to column-major flat array
  function rowMajorToColumnMajorFlat(m) {
    if (!Array.isArray(m)) return m;
    if (m.length === 16 && !Array.isArray(m[0])) return m;
    const out = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        out[c * 4 + r] = m[r][c];
      }
    }
    return out;
  }

  // Compute centroid from geometry
  // useEffect(() => {
  //   if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
  //   const posArr = geometry.attributes.position.array;
  //   const n = posArr.length / 3;
  //   if (n === 0) return;
  //   let cx = 0, cy = 0, cz = 0;
  //   for (let i = 0; i < posArr.length; i += 3) {
  //     cx += posArr[i];
  //     cy += posArr[i + 1];
  //     cz += posArr[i + 2];
  //   }
  //   cx /= n; cy /= n; cz /= n;
  //   setCentroid([cx, cy, cz]);
  // }, [geometry]);

  // Apply transform to group and compute transformed centroid
  useEffect(() => {
    if (!groupRef.current) return;

    // Reset transform
    groupRef.current.position.set(0,0,0);
    groupRef.current.quaternion.identity();
    groupRef.current.scale.set(1,1,1);

    if (!matrix) {
      setTransformedCentroid(null);
      return;
    }

    try {
      const m = new THREE.Matrix4();
      m.fromArray(rowMajorToColumnMajorFlat(matrix));

      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      m.decompose(position, quaternion, scale);

      groupRef.current.position.copy(position);
      groupRef.current.quaternion.copy(quaternion);
      // Keep scale as (1, 1, 1) — alignment is rigid (translation + rotation only)
      // Do NOT apply decomposed scale to retain original mesh size
      groupRef.current.scale.set(1, 1, 1);

      if (centroid) {
        const v = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);
        v.applyMatrix4(m);
        setTransformedCentroid(v.toArray());
        console.log("🔧 B centroid AFTER transform:", v.toArray());
      }
    } catch (error) {
      console.error("Error applying transform:", error);
    }
  }, [matrix, centroid]);

  // Auto-frame camera to fit geometry
  useEffect(() => {
    if (!geometry || !camera) return;
    geometry.computeBoundingSphere();
    if (!geometry.boundingSphere) return;
    const sphere = geometry.boundingSphere;
    const cameraFOV = camera.fov * Math.PI / 180;
    const distance = sphere.radius / Math.tan(cameraFOV / 2);
    camera.far = Math.max(camera.far ?? 0, distance * 4);
    camera.updateProjectionMatrix();
    camera.position.z = distance;
    camera.lookAt(sphere.center);
  }, [geometry, camera]);

  useEffect(() => {
    if (!animating) return;
    const interval = setInterval(() => setTime(t => t + 0.05), 50);
    return () => clearInterval(interval);
  }, [animating]);

  const currentOpacity = animating
    ? 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(time + phase))
    : FIXED_OPACITY;

  const markerSize = (() => {
    if (geometry && geometry.boundingSphere) return geometry.boundingSphere.radius * 0.02;
    if (geometry) { geometry.computeBoundingSphere(); return geometry.boundingSphere ? geometry.boundingSphere.radius * 0.02 : 0.01; }
    return 0.01;
  })();

  return (
    <>
      <group ref={groupRef}>
        <mesh ref={meshRef} geometry={geometry}>
          <meshStandardMaterial
            color={color}
            transparent
            opacity={currentOpacity}
            side={THREE.DoubleSide}
            depthWrite={FIXED_OPACITY > 0.95}
            metalness={0.1}
            roughness={0.4}
          />
        </mesh>

        {centroid && (
          <mesh position={centroid}>
            <sphereGeometry args={[markerSize, 12, 12]} />
            <meshStandardMaterial color={new THREE.Color(0x0064fa)} />
          </mesh>
        )}
      </group>

      {transformedCentroid && (
        <mesh position={transformedCentroid}>
          <sphereGeometry args={[markerSize , 12, 12]} />
          <meshStandardMaterial color={new THREE.Color(0xfaa500)} />
        </mesh>
      )}
    </>
  );
}

export default function VisualCompare({ fileA, fileB, transformB, centroidA, centroidB, worstDiscrepancyPoint, sceneDiagonal, onAlign, isLoading, loadingLabel }) {
  const [urlA, setUrlA] = useState(null);
  const [urlB, setUrlB] = useState(null);
  const [colorScheme, setColorScheme] = useState("green-magenta");
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [alignStatus, setAlignStatus] = useState("");
  const [showDiscrepancyArrow, setShowDiscrepancyArrow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasContainerRef = useRef(null);

  useEffect(() => {
    console.log("🎯 VisualCompare received worstDiscrepancyPoint:", worstDiscrepancyPoint);
    console.log("🎯 VisualCompare received sceneDiagonal:", sceneDiagonal);
  }, [worstDiscrepancyPoint, sceneDiagonal]);

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === canvasContainerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const hasBoth = Boolean(fileA && fileB);

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

  const handleToggleFullscreen = async () => {
    if (!canvasContainerRef.current) return;

    try {
      if (document.fullscreenElement === canvasContainerRef.current) {
        await document.exitFullscreen();
      } else {
        await canvasContainerRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error);
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
          <label className="control-label">Color Scheme</label>
          <select 
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
            className="control-select"
          >
            <option value="green-magenta">Green / Magenta (Overlap Detection)</option>
            <option value="blue-orange">Blue / Orange</option>
            <option value="purple-yellow">Purple / Yellow</option>
          </select>
        </div>

        <div className="control-button-group">
          <button
            onClick={() => setShowA(!showA)}
            className={`control-button ${!showA ? "inactive" : ""}`}
          >
            {showA ? "Hide" : "Show"} GT
          </button>
          <button
            onClick={() => setShowB(!showB)}
            className={`control-button ${!showB ? "inactive" : ""}`}
          >
            {showB ? "Hide" : "Show"} CANDIDATE
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
            className="control-button align-button"
            disabled={!hasBoth || isLoading}
          >
            {isLoading ? (
              <span className="inline-loading">
                <span className="loading-dots loading-dots-inline">
                  <span />
                  <span />
                  <span />
                </span>
                <span>{loadingLabel || "Aligning"}</span>
              </span>
            ) : (
              "Auto-Align Models"
            )}
          </button>
          {transformB && (
            <>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className={`control-button ${showRaw ? "active" : ""}`}
                style={{ flex: 1 }}
              >
                {showRaw ? "Show Aligned" : "Show Raw"}
              </button>
              {worstDiscrepancyPoint && !showRaw && (
                <>
                  {console.log("🎯 Showing arrow toggle button. worstDiscrepancyPoint:", worstDiscrepancyPoint, "showRaw:", showRaw)}
                  <button
                    onClick={() => setShowDiscrepancyArrow(!showDiscrepancyArrow)}
                    className={`control-button ${showDiscrepancyArrow ? "active" : ""}`}
                    style={{ flex: 1 }}
                    title="Toggle discrepancy indicator"
                  >
                    {showDiscrepancyArrow ? "🎯 Hide Arrow" : "🎯 Show Arrow"}
                  </button>
                </>
              )}
            </>
          )}
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
        {alignStatus && (
          <div className="legend-item align-status" style={{ 
            marginLeft: "auto",
            padding: "4px 12px", 
            background: alignStatus.includes("✓") ? "rgba(16, 185, 129, 0.15)" : alignStatus.includes("Error") ? "rgba(239, 68, 68, 0.15)" : "rgba(251, 191, 36, 0.15)",
            color: alignStatus.includes("✓") ? "#10b981" : alignStatus.includes("Error") ? "#ef4444" : "#fbbf24",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: "600",
            border: alignStatus.includes("✓") ? "1px solid rgba(16, 185, 129, 0.3)" : alignStatus.includes("Error") ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(251, 191, 36, 0.3)"
          }}>
            {alignStatus}
          </div>
        )}
      </div>

      <div ref={canvasContainerRef} className={`visual-compare-canvas ${isFullscreen ? "is-fullscreen" : ""}`}>
        <button
          onClick={handleToggleFullscreen}
          className="viewer-fullscreen-button"
          disabled={!hasBoth}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
        >
          {isFullscreen ? "⤢ Exit Fullscreen" : "⤢ Fullscreen"}
        </button>
        {hasBoth ? (
          <Canvas 
            camera={{ position: [3, 3, 3], fov: 50, near: 0.01, far: 100000 }}
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
                animating={animating}
                phase={0}
                centroid={centroidA}
              />
            )}
            {urlB && showB && (
              <Model
                url={urlB}
                color={scheme.color2}
                animating={animating}
                phase={Math.PI}
                matrix={showRaw ? null : transformB}
                centroid={centroidB} 
              />
            )}
            
            {/* Show discrepancy arrow when aligned and not in raw mode */}
            {worstDiscrepancyPoint && !showRaw && showDiscrepancyArrow && sceneDiagonal && (
              <>
                {console.log("🎯 Rendering DiscrepancyArrow at position:", worstDiscrepancyPoint, "diagonal:", sceneDiagonal)}
                <DiscrepancyArrow 
                  position={worstDiscrepancyPoint}
                  diagonal={sceneDiagonal}
                />
              </>
            )}
          </Canvas>
        ) : (
          <div className="visual-compare-placeholder">
            <p><strong>Upload both STL files</strong> to see the overlay.</p>
            <p>Use color scheme, opacity, and hide/show controls to inspect differences.</p>
          </div>
        )}
      </div>

      <div className="visual-compare-info">
        <div className="info-box">
          <strong>💡 How to use:</strong>
          <ul>
            <li>Drag to rotate, scroll to zoom, right-click to pan</li>
            <li>Adjust opacity to see through overlapping areas</li>
            <li>Use "Animate" to flash between models and spot differences</li>
            <li>Toggle individual models on/off to isolate features</li>
            {worstDiscrepancyPoint && <li>🎯 Red arrow points to the largest discrepancy after alignment</li>}
          </ul>
        </div>
        <div className="info-box">
          <strong>🎨 Understanding the colors:</strong>
          <ul>
            <li>Pure colors: unique features in each model</li>
            <li>Mixed/blended colors: overlapping geometry</li>
            <li>Gray areas (if visible): perfectly aligned surfaces</li>
            {worstDiscrepancyPoint && <li>🔴 Red arrow: area needs the most attention (potential huge discrepancy)</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}