// Processo do WhatsApp (produção, PM2 "pixel-wpp"). Mantém a conexão e o bot vivos e independentes da API:
// reiniciar/atualizar a API não derruba o WhatsApp. A API fala com este processo por HTTP local.
process.env.WA_ROLE = "worker";

import "./env.js";
import express from "express";
import { getSessionInfo, startLocalWhatsApp, workerFunctions } from "./wa/index.js";

const PORT = Number(process.env.WA_WORKER_PORT) || 3107;
const TOKEN = process.env.WA_INTERNAL_TOKEN || "";

const app = express();
app.use(express.json({ limit: "30mb" }));
app.use((req, res, next) => {
  if (TOKEN && req.headers["x-wa-token"] !== TOKEN) return res.status(401).json({ error: "não autorizado" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/status", (_req, res) => res.json(getSessionInfo()));

app.post("/rpc", async (req, res) => {
  const { fn, args = [] } = req.body ?? {};
  const f = workerFunctions[fn];
  if (!f) return res.status(404).json({ error: `função desconhecida: ${fn}` });
  try {
    // arquivos chegam em base64: { __buffer: "..." }
    const decoded = (args as any[]).map((a) => (a && typeof a === "object" && typeof a.__buffer === "string" ? Buffer.from(a.__buffer, "base64") : a));
    res.json({ result: (await f(...decoded)) ?? null });
  } catch (e: any) {
    console.error(`[wpp-worker] erro em ${fn}:`, e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[wpp-worker] ouvindo em 127.0.0.1:${PORT}`);
  void startLocalWhatsApp();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));
