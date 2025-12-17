import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { useEffect, useState, useRef } from "react";

export default function STLViewer({ file, matrix, centroid: surfaceCentroid }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [file]);

  if (!file) return <p>No model uploaded.</p>;

  return (
    <div style={{ width: "100%", height: "300px", border: "1px solid #ddd", borderRadius: "8px" }}>
      <Canvas>
        <OrbitControls />

        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />

        {url && <Model url={url} matrix={matrix} surfaceCentroid={surfaceCentroid} />}
      </Canvas>
    </div>
  );
}

function Model({ url, matrix, surfaceCentroid }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const geometry = useLoader(STLLoader, url);

  const [vertexCentroid, setVertexCentroid] = useState(null);
  const [transformedCentroid, setTransformedCentroid] = useState(null);

  // Compute simple vertex centroid as fallback
  useEffect(() => {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
    const posArr = geometry.attributes.position.array;
    const n = posArr.length / 3;
    if (n === 0) return;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < posArr.length; i += 3) {
      cx += posArr[i];
      cy += posArr[i + 1];
      cz += posArr[i + 2];
    }
    cx /= n; cy /= n; cz /= n;
    setVertexCentroid([cx, cy, cz]);
  }, [geometry]);

  // Apply transform to group and compute transformed centroid (use surfaceCentroid when provided)
  useEffect(() => {
    if (!groupRef.current) return;

    // Reset transform
    groupRef.current.position.set(0, 0, 0);
    groupRef.current.quaternion.identity();
    groupRef.current.scale.set(1, 1, 1);

    if (!matrix) {
      setTransformedCentroid(null);
      return;
    }

    const toColumnMajor = (m) => {
      if (!Array.isArray(m)) return m;
      if (m.length === 16 && !Array.isArray(m[0])) return m;
      const out = new Array(16);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          out[c * 4 + r] = m[r][c];
        }
      }
      return out;
    };

    try {
      const m4 = new THREE.Matrix4();
      m4.fromArray(toColumnMajor(matrix));

      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      m4.decompose(pos, quat, scale);

      groupRef.current.position.copy(pos);
      groupRef.current.quaternion.copy(quat);
      // Keep scale as (1, 1, 1) — alignment is rigid (translation + rotation only)
      // Do NOT apply decomposed scale to retain original mesh size
      groupRef.current.scale.set(1, 1, 1);

      const sourceCent = Array.isArray(surfaceCentroid) ? surfaceCentroid : vertexCentroid;
      if (sourceCent) {
        const v = new THREE.Vector3(sourceCent[0], sourceCent[1], sourceCent[2]);
        v.applyMatrix4(m4);
        setTransformedCentroid(v.toArray());
      }
    } catch (e) {
      console.error("Error applying transform in STLViewer:", e);
    }
  }, [matrix, vertexCentroid, surfaceCentroid]);

  const markerSize = (() => {
    if (geometry && geometry.boundingSphere) return geometry.boundingSphere.radius * 0.02;
    if (geometry) { geometry.computeBoundingSphere(); return geometry.boundingSphere ? geometry.boundingSphere.radius * 0.02 : 0.01; }
    return 0.01;
  })();

  return (
    <>
      <group ref={groupRef}>
        <mesh ref={meshRef} geometry={geometry}>
          <meshStandardMaterial color="#3b82f6" />
        </mesh>

        {/* Original centroid marker (local) - prefer backend surface centroid when provided */}
        {surfaceCentroid ? (
          <mesh position={surfaceCentroid}>
            <sphereGeometry args={[markerSize, 12, 12]} />
            <meshStandardMaterial color="#00bcd4" />
          </mesh>
        ) : (
          vertexCentroid && (
            <mesh position={vertexCentroid}>
              <sphereGeometry args={[markerSize, 12, 12]} />
              <meshStandardMaterial color="#ff0066" />
            </mesh>
          )
        )}
      </group>

      {/* Transformed centroid marker (world after matrix) - render outside the transformed group */}
      {transformedCentroid && (
        <mesh position={transformedCentroid}>
          <sphereGeometry args={[markerSize * 1.2, 12, 12]} />
          <meshStandardMaterial color="#10b981" />
        </mesh>
      )}
    </>
  );
}

