import "./env.js";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { FRONT_DIST } from "./env.js";
import { requireAuth } from "./auth.js";
import { publicRouter, router as coreRouter } from "./routes/core.js";
import { router as salesRouter } from "./routes/sales.js";
import { router as wppRouter } from "./routes/wpp.js";
import { router as servicesRouter } from "./routes/services.js";
import { router as documentsRouter } from "./routes/documents.js";
import { router as settingsRouter } from "./routes/settings.js";
import { HttpError } from "./routes/util.js";
import { sseHandler, broadcastChange } from "./lib/events.js";
import { router as bulkRouter } from "./routes/bulk.js";
import { router as notesRouter } from "./routes/notes.js";
import { publicSite, adminSite } from "./routes/site.js";
import { isWhatsAppLocal, startLocalWhatsApp } from "./wa/index.js";

const PORT = Number(process.env.PORT) || 3100;
const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
// tempo real: qualquer gravação bem-sucedida avisa os painéis abertos
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.method !== "OPTIONS") res.on("finish", () => { if (res.statusCode < 400) broadcastChange(); });
  next();
});
app.get("/api/events", requireAuth, sseHandler);
app.post("/api/internal/notify", (req, res) => {
  if (!process.env.WA_INTERNAL_TOKEN || req.headers["x-wa-token"] !== process.env.WA_INTERNAL_TOKEN) return res.status(401).end();
  broadcastChange(); res.status(204).end();
});
app.use("/api", publicRouter, publicSite);
app.use("/api", requireAuth, coreRouter, salesRouter, wppRouter, servicesRouter, documentsRouter, settingsRouter, bulkRouter, notesRouter, adminSite);

app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Em produção a API também serve o painel já compilado
if (fs.existsSync(FRONT_DIST)) {
  app.use(express.static(FRONT_DIST));
  app.get("*", (_req, res) => res.sendFile(path.join(FRONT_DIST, "index.html")));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // erros conhecidos do Prisma viram mensagens úteis
  if (err?.code === "P2025") return res.status(404).json({ error: "Registro não encontrado." });
  if (err?.code === "P2003") return res.status(409).json({ error: "Este registro está em uso e não pode ser removido." });
  if (err?.code === "P2002") return res.status(409).json({ error: "Já existe um registro com estes dados." });
  if (err?.name === "MulterError") return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Arquivo grande demais." : "Falha no envio do arquivo." });
  console.error("[api]", err);
  res.status(500).json({ error: "Erro interno. Tente novamente." });
});

app.listen(PORT, () => {
  console.log(`[api] Pixel Gráfica rodando em http://localhost:${PORT}`);
  // Desenvolvimento: o WhatsApp roda aqui dentro. Produção (WA_WORKER_URL): roda no worker.
  if (isWhatsAppLocal()) void startLocalWhatsApp();
});
