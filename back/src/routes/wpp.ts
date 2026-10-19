// WhatsApp: conexão, caixa de entrada, atendimento e configuração do bot (menus, setores, conhecimento, IA).
import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { ah, HttpError, str } from "./util.js";
import * as wa from "../wa/index.js";
import { record, targetOf, parseAttendants } from "../wa/conversations.js";
import { testConnection, MODEL_PRESETS, DEFAULT_MODEL } from "../wa/ai.js";
import { encryptSecret } from "../lib/secrets.js";
import { saveAttachment, filePath } from "../lib/files.js";
import { digits, normalizePhone } from "../lib/text.js";
import fs from "fs";

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } });

// ── Conexão ──────────────────────────────────────────────────────────────────
router.get("/wpp/status", (_req, res) => res.json(wa.getSessionInfo()));
router.post("/wpp/connect", ah(async (_req, res) => { await wa.connectSession(); res.json({ ok: true }); }));
router.post("/wpp/disconnect", ah(async (_req, res) => { await wa.disconnectSession(); res.json({ ok: true }); }));

// ── Caixa de entrada ─────────────────────────────────────────────────────────
const convInclude = {
  sector: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  messages: { orderBy: { sentAt: "desc" as const }, take: 1, select: { body: true, fromRole: true, sentAt: true } },
};

router.get("/wpp/conversations", ah(async (req, res) => {
  const tab = str(req.query.tab, 20) ?? "open";
  const where = tab === "closed" ? { status: "closed" } : tab === "bot" ? { status: "bot" } : tab === "waiting" ? { status: "waiting" } : tab === "mine" ? { status: "active", attendantId: req.user!.id } : { status: { in: ["waiting", "active"] } };
  const rows = await prisma.wppConversation.findMany({ where, include: convInclude, orderBy: { updatedAt: "desc" }, take: 150 });
  const [waiting, active, bot] = await Promise.all(["waiting", "active", "bot"].map((s) => prisma.wppConversation.count({ where: { status: s } })));
  res.json({ items: rows.map(({ messages, ...c }) => ({ ...c, last: messages[0] ?? null })), counts: { waiting, active, bot } });
}));

router.get("/wpp/conversations/:id", ah(async (req, res) => {
  const c = await prisma.wppConversation.findUnique({
    where: { id: req.params.id },
    include: {
      sector: { select: { id: true, name: true } }, customer: true,
      messages: { orderBy: { sentAt: "asc" }, take: 500 },
    },
  });
  if (!c) throw new HttpError(404, "Conversa não encontrada.");
  const ids = c.messages.map((m) => m.attachmentId).filter(Boolean) as string[];
  const atts = ids.length ? await prisma.attachment.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, mime: true, size: true, orderId: true } }) : [];
  const byId = new Map(atts.map((a) => [a.id, a]));
  res.json({ ...c, messages: c.messages.map((m) => ({ ...m, attachment: m.attachmentId ? byId.get(m.attachmentId) ?? null : null })) });
}));

const mustBeMine = async (id: string, userId: string) => {
  const c = await prisma.wppConversation.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, "Conversa não encontrada.");
  if (c.status !== "active") throw new HttpError(409, "Assuma o atendimento antes de responder.");
  if (c.attendantId && c.attendantId !== userId) throw new HttpError(403, `Atendimento de ${c.attendantName}.`);
  return c;
};

router.post("/wpp/conversations/:id/accept", ah(async (req, res) => {
  const conv = await wa.acceptWaitingConversation(req.params.id, { id: req.user!.id, name: req.user!.name });
  if (!conv) throw new HttpError(409, "Este atendimento já foi assumido por outra pessoa.");
  res.json({ ok: true });
}));

router.post("/wpp/conversations/:id/messages", ah(async (req, res) => {
  const text = str(req.body?.text, 4000);
  if (!text) throw new HttpError(400, "Escreva a mensagem.");
  const c = await mustBeMine(req.params.id, req.user!.id);
  if (wa.getSessionInfo().status !== "connected") throw new HttpError(503, "O WhatsApp não está conectado.");
  if (!(await wa.sendMessage(targetOf(c), text))) throw new HttpError(502, "Não consegui enviar a mensagem.");
  await record(c.id, "attendant", text);
  res.json({ ok: true });
}));

router.post("/wpp/conversations/:id/files", upload.single("file"), ah(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "Selecione um arquivo.");
  const c = await mustBeMine(req.params.id, req.user!.id);
  const caption = str(req.body?.caption, 1000) ?? undefined;
  const att = await saveAttachment({ buffer: f.buffer, name: f.originalname, mime: f.mimetype, kind: "chat", conversationId: c.id, customerId: c.customerId, uploadedBy: req.user!.name });
  if (!(await wa.sendFile(targetOf(c), f.buffer, att.name, att.mime, caption))) throw new HttpError(502, "Não consegui enviar o arquivo.");
  await record(c.id, "attendant", caption ? `📎 ${att.name}\n${caption}` : `📎 ${att.name}`, att.id);
  res.json({ ok: true });
}));

// Envia por WhatsApp um arquivo que já está no sistema (ex.: prova da arte de um pedido)
router.post("/wpp/conversations/:id/send-attachment", ah(async (req, res) => {
  const c = await mustBeMine(req.params.id, req.user!.id);
  const att = await prisma.attachment.findUnique({ where: { id: String(req.body?.attachmentId) } });
  if (!att) throw new HttpError(404, "Arquivo não encontrado.");
  const ok = await wa.sendFile(targetOf(c), fs.readFileSync(filePath(att.storedName)), att.name, att.mime, str(req.body?.caption, 1000) ?? undefined);
  if (!ok) throw new HttpError(502, "Não consegui enviar o arquivo.");
  await record(c.id, "attendant", `📎 ${att.name}`, att.id);
  res.json({ ok: true });
}));

router.post("/wpp/conversations/:id/close", ah(async (req, res) => {
  const r = await wa.closeActiveConversation(req.params.id, req.user!.name, req.body?.silent ? "" : undefined);
  if (!r) throw new HttpError(409, "Esta conversa já foi encerrada.");
  res.json({ ok: true });
}));

router.post("/wpp/conversations/:id/transfer", ah(async (req, res) => {
  if (req.body?.userId) {
    const r = await wa.transferToPerson(req.params.id, String(req.body.userId), req.user!.name);
    if (!r.ok) throw new HttpError(409, r.error);
    return res.json({ ok: true, to: r.name });
  }
  if (!req.body?.sectorId) throw new HttpError(400, "Escolha uma pessoa ou um setor.");
  const r = await wa.transferConversation(req.params.id, String(req.body.sectorId), req.user!.name);
  if (!r) throw new HttpError(404, "Setor não encontrado.");
  res.json({ ok: true });
}));

// Pessoas que podem receber uma transferência direta (inclui quem não tem permissão de ver Usuários)
router.get("/wpp/attendants", ah(async (_req, res) => {
  const users = await prisma.user.findMany({ where: { active: true, role: { in: ["admin", "atendente"] } }, orderBy: { name: "asc" } });
  res.json(users.map((u) => ({ id: u.id, name: u.name, role: u.role, hasWhatsapp: !!u.phone })));
}));

// Contadores leves do menu lateral
router.get("/wpp/counts", ah(async (req, res) => {
  const [waiting, mine, active, bot] = await Promise.all([
    prisma.wppConversation.count({ where: { status: "waiting" } }),
    prisma.wppConversation.count({ where: { status: "active", attendantId: req.user!.id } }),
    prisma.wppConversation.count({ where: { status: "active" } }),
    prisma.wppConversation.count({ where: { status: "bot" } }),
  ]);
  res.json({ fila: waiting, meus: mine, abertos: waiting + active, bot });
}));

// Vincula a conversa a um cliente (ou cria o cadastro a partir do número)
router.post("/wpp/conversations/:id/customer", ah(async (req, res) => {
  const c = await prisma.wppConversation.findUnique({ where: { id: req.params.id } });
  if (!c) throw new HttpError(404, "Conversa não encontrada.");
  let customerId = str(req.body?.customerId, 36);
  if (!customerId) {
    const name = str(req.body?.name, 160) ?? c.clientName ?? "Cliente WhatsApp";
    customerId = (await prisma.customer.create({ data: { name, phone: normalizePhone(c.clientPhone) } })).id;
  }
  await prisma.wppConversation.update({ where: { id: c.id }, data: { customerId } });
  await prisma.attachment.updateMany({ where: { conversationId: c.id, customerId: null }, data: { customerId } });
  res.json({ ok: true, customerId });
}));

// Guarda o arquivo recebido no WhatsApp dentro de um pedido
router.post("/wpp/attachments/:id/to-order", ah(async (req, res) => {
  if (!req.body?.orderId) throw new HttpError(400, "Escolha o pedido.");
  await prisma.attachment.update({ where: { id: req.params.id }, data: { orderId: String(req.body.orderId), kind: "order" } });
  res.json({ ok: true });
}));

router.post("/wpp/start", ah(async (req, res) => {
  const r = await wa.startConversation({
    phone: String(req.body?.phone || ""), name: str(req.body?.name, 160), message: String(req.body?.message || ""),
    attendantId: req.user!.id, attendantName: req.user!.name, sectorId: str(req.body?.sectorId, 36),
  });
  if (!r.ok) throw new HttpError(400, r.error);
  res.json(r);
}));

// ── Configuração do bot ──────────────────────────────────────────────────────
const configOut = (c: any) => ({
  botEnabled: c.botEnabled, useButtons: c.useButtons, welcomeMsg: c.welcomeMsg, offHoursMsg: c.offHoursMsg, aiEnabled: c.aiEnabled, aiPrompt: c.aiPrompt,
  aiProvider: c.aiProvider === "openai" ? "openai" : "gemini",
  geminiModel: c.geminiModel, openaiModel: c.openaiModel,
  hasGeminiKey: !!c.geminiApiKeyEncrypted || !!process.env.GEMINI_API_KEY, hasOpenaiKey: !!c.openaiApiKeyEncrypted || !!process.env.OPENAI_API_KEY,
  presets: MODEL_PRESETS,
});
const getConfig = async () => (await prisma.wppBotConfig.findFirst()) ?? prisma.wppBotConfig.create({ data: {} });

router.get("/bot/config", ah(async (_req, res) => { res.json(configOut(await getConfig())); }));

router.put("/bot/config", ah(async (req, res) => {
  const b = req.body ?? {}, cur = await getConfig();
  const data: any = {};
  for (const k of ["botEnabled", "useButtons", "aiEnabled"]) if (b[k] !== undefined) data[k] = !!b[k];
  for (const k of ["welcomeMsg", "offHoursMsg", "aiPrompt"]) if (b[k] !== undefined) data[k] = str(b[k], 4000);
  if (b.aiProvider === "gemini" || b.aiProvider === "openai") data.aiProvider = b.aiProvider;
  if (b.geminiModel !== undefined) data.geminiModel = str(b.geminiModel, 80) ?? DEFAULT_MODEL.gemini;
  if (b.openaiModel !== undefined) data.openaiModel = str(b.openaiModel, 80) ?? DEFAULT_MODEL.openai;
  if (str(b.geminiApiKey, 300)) data.geminiApiKeyEncrypted = encryptSecret(str(b.geminiApiKey, 300)!, "gemini-api-key");
  if (str(b.openaiApiKey, 300)) data.openaiApiKeyEncrypted = encryptSecret(str(b.openaiApiKey, 300)!, "openai-api-key");
  if (b.clearGeminiKey) data.geminiApiKeyEncrypted = null;
  if (b.clearOpenaiKey) data.openaiApiKeyEncrypted = null;
  const saved = await prisma.wppBotConfig.update({ where: { id: cur.id }, data });
  await wa.reloadBotConfig();
  res.json(configOut(saved));
}));

router.post("/bot/test-ai", ah(async (_req, res) => { res.json(await testConnection()); }));

// ── Setores ──────────────────────────────────────────────────────────────────
router.get("/bot/sectors", ah(async (_req, res) => {
  const rows = await prisma.wppSector.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(rows.map((s) => ({ ...s, attendants: parseAttendants(s.attendants) })));
}));

const sectorData = (b: any) => ({
  name: str(b.name, 100) ?? (() => { throw new HttpError(400, "Informe o nome do setor."); })(),
  description: str(b.description, 255), isActive: b.isActive === undefined ? true : !!b.isActive, sortOrder: Number(b.sortOrder) || 0,
  attendants: JSON.stringify((Array.isArray(b.attendants) ? b.attendants : []).filter((a: any) => digits(a?.phone).length >= 10)
    .map((a: any) => ({ name: str(a.name, 100) ?? "Atendente", phone: normalizePhone(a.phone), available: a.available !== false }))),
});
router.post("/bot/sectors", ah(async (req, res) => { res.status(201).json(await prisma.wppSector.create({ data: sectorData(req.body ?? {}) })); }));
router.put("/bot/sectors/:id", ah(async (req, res) => { res.json(await prisma.wppSector.update({ where: { id: req.params.id }, data: sectorData(req.body ?? {}) })); }));
router.delete("/bot/sectors/:id", ah(async (req, res) => {
  if (await prisma.wppConversation.count({ where: { sectorId: req.params.id, status: { in: ["waiting", "active"] } } })) throw new HttpError(409, "Há atendimentos em andamento neste setor.");
  await prisma.wppFlowNode.updateMany({ where: { sectorId: req.params.id }, data: { sectorId: null, isActive: false } });
  await prisma.wppConversation.updateMany({ where: { sectorId: req.params.id }, data: { sectorId: null } });
  await prisma.wppSector.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Menus (nós do fluxo) ─────────────────────────────────────────────────────
const NODE_TYPES = ["menu", "message", "sector", "ai", "end"];
router.get("/bot/nodes", ah(async (_req, res) => {
  const rows = await prisma.wppFlowNode.findMany({ orderBy: [{ isStart: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  res.json(rows.map((n) => ({ ...n, options: JSON.parse(n.options || "[]") })));
}));

function nodeData(b: any) {
  const type = String(b.type);
  if (!NODE_TYPES.includes(type)) throw new HttpError(400, "Tipo de tela inválido.");
  const options = (Array.isArray(b.options) ? b.options : []).map((o: any, i: number) => ({ key: str(String(o.key ?? i + 1), 10) ?? String(i + 1), label: str(o.label, 60) ?? "", nextNodeId: str(o.nextNodeId, 36) })).filter((o: any) => o.label);
  if (type === "menu" && options.length > 10) throw new HttpError(400, "O WhatsApp aceita no máximo 10 opções por menu.");
  if (type === "sector" && !str(b.sectorId, 36)) throw new HttpError(400, "Escolha o setor desta tela.");
  return {
    type, title: str(b.title, 160) ?? (() => { throw new HttpError(400, "Dê um nome para a tela."); })(), content: str(b.content, 3000),
    options: type === "menu" ? JSON.stringify(options) : null, sectorId: type === "sector" ? str(b.sectorId, 36) : null,
    isStart: !!b.isStart, isActive: b.isActive === undefined ? true : !!b.isActive, sortOrder: Number(b.sortOrder) || 0,
  };
}
const unsetOtherStarts = (exceptId?: string) => prisma.wppFlowNode.updateMany({ where: { isStart: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isStart: false } });

router.post("/bot/nodes", ah(async (req, res) => {
  const data = nodeData(req.body ?? {});
  if (data.isStart) await unsetOtherStarts();
  res.status(201).json(await prisma.wppFlowNode.create({ data }));
}));
router.put("/bot/nodes/:id", ah(async (req, res) => {
  const data = nodeData(req.body ?? {});
  if (data.isStart) await unsetOtherStarts(req.params.id);
  res.json(await prisma.wppFlowNode.update({ where: { id: req.params.id }, data }));
}));
router.delete("/bot/nodes/:id", ah(async (req, res) => {
  const node = await prisma.wppFlowNode.findUnique({ where: { id: req.params.id } });
  if (node?.isStart) throw new HttpError(409, "Esta é a tela inicial. Defina outra como inicial antes de excluir.");
  // tira a tela excluída das opções dos outros menus
  for (const m of await prisma.wppFlowNode.findMany({ where: { type: "menu" } })) {
    const opts = JSON.parse(m.options || "[]"), kept = opts.filter((o: any) => o.nextNodeId !== req.params.id);
    if (kept.length !== opts.length) await prisma.wppFlowNode.update({ where: { id: m.id }, data: { options: JSON.stringify(kept) } });
  }
  await prisma.wppFlowNode.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Conhecimento (respostas prontas) ─────────────────────────────────────────
router.get("/bot/knowledge", ah(async (_req, res) => { res.json(await prisma.wppKnowledge.findMany({ orderBy: { title: "asc" } })); }));
const knowledgeData = (b: any) => ({
  title: str(b.title, 120) ?? (() => { throw new HttpError(400, "Informe o título."); })(),
  phrases: str(b.phrases, 3000) ?? (() => { throw new HttpError(400, "Escreva ao menos uma frase que o cliente costuma dizer."); })(),
  answer: str(b.answer, 3000) ?? (() => { throw new HttpError(400, "Escreva a resposta."); })(),
  action: str(b.action, 60) ?? "reply", enabled: b.enabled === undefined ? true : !!b.enabled,
});
router.post("/bot/knowledge", ah(async (req, res) => { res.status(201).json(await prisma.wppKnowledge.create({ data: knowledgeData(req.body ?? {}) })); }));
router.put("/bot/knowledge/:id", ah(async (req, res) => { res.json(await prisma.wppKnowledge.update({ where: { id: req.params.id }, data: knowledgeData(req.body ?? {}) })); }));
router.delete("/bot/knowledge/:id", ah(async (req, res) => { await prisma.wppKnowledge.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }));
