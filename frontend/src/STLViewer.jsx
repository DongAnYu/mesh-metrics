import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { useEffect, useState, useRef } from "react";

export default function STLViewer({ file, matrix }) {
  const [url, setUrl] = useState(null);

  // Convert URL.createObjectURL only when file changes
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

        {url && <Model url={url} matrix={matrix} />}
      </Canvas>
    </div>
  );
}

function Model({ url, matrix }) {
  const meshRef = useRef();
  const geometry = useLoader(STLLoader, url);

  useEffect(() => {
    if (!meshRef.current) return;

    if (matrix) {
      // Convert row-major nested array (backend) to column-major flat array
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

      const m4 = new THREE.Matrix4();
      m4.fromArray(toColumnMajor(matrix));

      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      m4.decompose(pos, quat, scale);

      meshRef.current.position.copy(pos);
      meshRef.current.quaternion.copy(quat);
      meshRef.current.scale.copy(scale);
    } else {
      meshRef.current.position.set(0, 0, 0);
      meshRef.current.quaternion.identity();
      meshRef.current.scale.set(1, 1, 1);
    }
  }, [matrix]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial color="#3b82f6" />
    </mesh>
  );
}
