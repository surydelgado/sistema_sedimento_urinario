"use client";

import { useState } from "react";

export default function AnalisisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const sendImage = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://localhost:8000/predict/", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Análisis de Imagen</h1>

      <input
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button onClick={sendImage} disabled={!file || loading} style={{ marginLeft: 10 }}>
        {loading ? "Analizando..." : "Enviar a IA"}
      </button>

      {result && (
        <pre style={{ marginTop: 20, background: "#111", color: "#0f0", padding: 10 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
