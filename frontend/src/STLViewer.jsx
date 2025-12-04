import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { useEffect, useState } from "react";

export default function STLViewer({ file }) {
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

        {url && <Model url={url} />}
      </Canvas>
    </div>
  );
}

function Model({ url }) {
  const geometry = useLoader(STLLoader, url);

  return (
    <mesh geometry={geometry} scale={[1, 1, 1]}>
      <meshStandardMaterial color={"#3b82f6"} metalness={0.1} roughness={0.4} />
    </mesh>
  );
}
