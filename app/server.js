// QuantumQuack Insurance — portal de subida de fotos de siniestros.
// El contenedor NUNCA recibe la foto: solo firma una URL V4 de 5 minutos
// y el navegador hace PUT directo a Cloud Storage.
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

const BUCKET = process.env.BUCKET_NAME;
const PORT = process.env.PORT || 8080;
const URL_TTL_MS = 5 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Extra: solo se aceptan imágenes. El content-type queda dentro de la firma,
// así que si el navegador manda otro tipo, Cloud Storage responde 403.
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const storage = new Storage();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// /health y no /healthz: Cloud Run reserva las rutas que terminan en "z" (devuelven 404 sin llegar al contenedor).
app.get("/health", (_req, res) => res.send("ok"));

app.post("/api/upload-url", async (req, res) => {
  const { contentType, size, claimId } = req.body || {};
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return res.status(400).json({ error: "Tipo de archivo no permitido. Solo JPG, PNG o WEBP." });
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
    return res.status(400).json({ error: "El archivo tiene que pesar menos de 10 MB." });
  }
  const safeClaim = String(claimId || "sin-numero").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "sin-numero";
  const objectName = `uploads/${safeClaim}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  try {
    const [url] = await storage
      .bucket(BUCKET)
      .file(objectName)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + URL_TTL_MS,
        contentType,
        // El tamaño también queda firmado: no se puede subir algo más grande.
        extensionHeaders: { "x-goog-content-length-range": `0,${MAX_BYTES}` },
      });
    console.log(JSON.stringify({ severity: "INFO", msg: "signed_url_issued", objectName, contentType, size }));
    res.json({ url, objectName, maxBytes: MAX_BYTES, expiresInSeconds: URL_TTL_MS / 1000 });
  } catch (err) {
    console.error(JSON.stringify({ severity: "ERROR", msg: "sign_failed", error: err.message }));
    res.status(500).json({ error: "No se pudo generar la URL de subida." });
  }
});

// Solo para la demo: fuerza un 500 y dispara la alerta de Cloud Monitoring.
app.get("/api/boom", (_req, res) => {
  console.error(JSON.stringify({ severity: "ERROR", msg: "forced_error_for_demo" }));
  res.status(500).json({ error: "Error forzado para probar la alerta." });
});

if (!BUCKET) {
  console.error("Falta la variable BUCKET_NAME");
  process.exit(1);
}
app.listen(PORT, () => console.log(`QuantumQuack escuchando en :${PORT}`));
