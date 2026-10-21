// Anotações do atendimento (cliente, orçamento, ordem de serviço, conversa).
import { Router } from "express";
import { prisma } from "../db.js";
import { ah, HttpError, str } from "./util.js";
import { createBriefing } from "../wa/briefing.js";

export const router = Router();

// Cada tela vê o que é dela e o que vem junto: a ordem de serviço mostra também as do orçamento e do cliente; o orçamento, as do cliente.
router.get("/notes", ah(async (req, res) => {
  const q = req.query, or: any[] = [];
  if (q.conversationId) or.push({ conversationId: String(q.conversationId) });
  if (q.customerId) or.push({ customerId: String(q.customerId) });
  if (q.quoteId) {
    or.push({ quoteId: String(q.quoteId) });
    const quote = await prisma.quote.findUnique({ where: { id: String(q.quoteId) }, select: { customerId: true } });
    if (quote) or.push({ customerId: quote.customerId });
  }
  if (q.orderId) {
    or.push({ orderId: String(q.orderId) });
    const order = await prisma.order.findUnique({ where: { id: String(q.orderId) }, select: { customerId: true, quoteId: true } });
    if (order) { or.push({ customerId: order.customerId }); if (order.quoteId) or.push({ quoteId: order.quoteId }); }
  }
  if (!or.length) throw new HttpError(400, "Informe de onde buscar as anotações.");
  res.json(await prisma.note.findMany({ where: { OR: or }, orderBy: { createdAt: "desc" }, take: 50 }));
}));

router.post("/notes", ah(async (req, res) => {
  const b = req.body ?? {};
  const body = str(b.body, 3000);
  if (!body) throw new HttpError(400, "Escreva a anotação.");
  const link = { customerId: str(b.customerId, 36), quoteId: str(b.quoteId, 36), orderId: str(b.orderId, 36), conversationId: str(b.conversationId, 36) };
  if (!Object.values(link).some(Boolean)) throw new HttpError(400, "A anotação precisa estar ligada a um cliente, orçamento, ordem ou conversa.");
  res.status(201).json(await prisma.note.create({ data: { ...link, title: str(b.title, 160) ?? `Anotação · ${new Date().toLocaleDateString("pt-BR")}`, body, source: "manual", createdBy: req.user!.name } }));
}));

router.delete("/notes/:id", ah(async (req, res) => { await prisma.note.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }));

// Gera agora as anotações de uma conversa (botão "Gerar com a IA")
router.post("/wpp/conversations/:id/briefing", ah(async (req, res) => {
  const note = await createBriefing(req.params.id, { by: req.user!.name });
  if (!note) throw new HttpError(409, "Ainda não há mensagens do cliente para resumir.");
  res.status(201).json(note);
}));
