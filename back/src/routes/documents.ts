// PDFs de orçamento e ordem de serviço, envio por WhatsApp, pagamentos e avisos ao cliente.
import { Router } from "express";
import { prisma } from "../db.js";
import { ah, HttpError, str, num } from "./util.js";
import { quotePdf, orderPdf } from "../lib/documents.js";
import { sendPdf, sendText } from "../lib/notify.js";
import { brl } from "../lib/text.js";

export const router = Router();

// ── PDF (abrir/baixar) ───────────────────────────────────────────────────────
const sendPdfResponse = (res: any, file: { buffer: Buffer; fileName: string } | null, download: boolean) => {
  if (!file) throw new HttpError(404, "Documento não encontrado.");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store"); // documento sempre atualizado: nunca mostra um PDF antigo guardado pelo navegador
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${file.fileName}"`);
  res.send(file.buffer);
};
router.get("/quotes/:id/pdf", ah(async (req, res) => sendPdfResponse(res, await quotePdf(req.params.id), req.query.download === "1")));
router.get("/orders/:id/pdf", ah(async (req, res) => sendPdfResponse(res, await orderPdf(req.params.id), req.query.download === "1")));

// ── Enviar o PDF ao cliente pelo WhatsApp (com mensagem) ─────────────────────
router.post("/quotes/:id/send", ah(async (req, res) => {
  const q = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!q) throw new HttpError(404, "Orçamento não encontrado.");
  const doc = await quotePdf(q.id);
  if (!doc) throw new HttpError(404, "Orçamento não encontrado.");
  const message = str(req.body?.message, 3000) ?? `Olá, ${q.customer.name.split(" ")[0]}! Segue o orçamento nº ${q.number}, no valor de ${brl(Number(q.total))}. Qualquer dúvida é só falar! 💙`;
  await sendPdf({ phone: q.customer.phone, buffer: doc.buffer, fileName: doc.fileName, message, userName: req.user!.name, customerId: q.customerId, quoteId: q.id });
  await prisma.quote.update({ where: { id: q.id }, data: { sentAt: new Date(), ...(q.status === "rascunho" ? { status: "enviado" } : {}) } });
  res.json({ ok: true });
}));

router.post("/orders/:id/send", ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  const doc = await orderPdf(o.id);
  if (!doc) throw new HttpError(404, "Pedido não encontrado.");
  const message = str(req.body?.message, 3000) ?? `Olá, ${o.customer.name.split(" ")[0]}! Segue a ordem de serviço nº ${o.number} do seu pedido. 💙`;
  await sendPdf({ phone: o.customer.phone, buffer: doc.buffer, fileName: doc.fileName, message, userName: req.user!.name, customerId: o.customerId, orderId: o.id });
  await prisma.orderEvent.create({ data: { orderId: o.id, status: o.status, note: "Ordem de serviço enviada ao cliente pelo WhatsApp (PDF)", userName: req.user!.name } });
  res.json({ ok: true });
}));

// Aviso de texto livre ao cliente (ex.: "seu pedido está pronto")
router.post("/orders/:id/notify", ah(async (req, res) => {
  const message = str(req.body?.message, 3000);
  if (!message) throw new HttpError(400, "Escreva a mensagem.");
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  await sendText(o.customer.phone, message);
  await prisma.orderEvent.create({ data: { orderId: o.id, status: o.status, note: "Cliente avisado pelo WhatsApp", userName: req.user!.name } });
  res.json({ ok: true });
}));

// ── Pagamentos do pedido ─────────────────────────────────────────────────────
async function recalcPaid(orderId: string) {
  const sum = await prisma.orderPayment.aggregate({ where: { orderId }, _sum: { amount: true } });
  return prisma.order.update({ where: { id: orderId }, data: { paid: Number(sum._sum.amount ?? 0) } });
}

router.post("/orders/:id/payments", ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  const amount = Math.round(num(req.body?.amount) * 100) / 100;
  if (!(amount > 0)) throw new HttpError(400, "Informe um valor maior que zero.");
  const remaining = Math.round((Number(o.total) - Number(o.paid)) * 100) / 100;
  if (amount > remaining + 0.001) throw new HttpError(400, `O valor passa do que falta receber (${brl(remaining)}).`);
  const method = str(req.body?.method, 30);
  await prisma.orderPayment.create({ data: { orderId: o.id, amount, method, note: str(req.body?.note, 300), userName: req.user!.name } });
  const updated = await recalcPaid(o.id);
  await prisma.orderEvent.create({ data: { orderId: o.id, status: o.status, note: `Pagamento de ${brl(amount)} registrado${method ? ` (${method})` : ""}`, userName: req.user!.name } });

  // recibo opcional por WhatsApp (o pagamento já foi gravado mesmo se o envio falhar)
  let notified: boolean | null = null, notifyError: string | null = null;
  if (req.body?.notify) {
    const left = Math.max(0, Number(o.total) - Number(updated.paid));
    const message = str(req.body?.message, 3000) ?? `Olá, ${o.customer.name.split(" ")[0]}! Recebemos ${brl(amount)} do pedido nº ${o.number}. ${left > 0 ? `Falta ${brl(left)}.` : "Pedido quitado, obrigada! 💙"}`;
    try { await sendText(o.customer.phone, message); notified = true; } catch (e) { notified = false; notifyError = (e as Error).message; }
  }
  res.status(201).json({ ok: true, paid: Number(updated.paid), notified, notifyError });
}));

router.delete("/orders/:id/payments/:pid", ah(async (req, res) => {
  const p = await prisma.orderPayment.findFirst({ where: { id: req.params.pid, orderId: req.params.id } });
  if (!p) throw new HttpError(404, "Pagamento não encontrado.");
  await prisma.orderPayment.delete({ where: { id: p.id } });
  const updated = await recalcPaid(req.params.id);
  await prisma.orderEvent.create({ data: { orderId: req.params.id, status: updated.status, note: `Pagamento de ${brl(Number(p.amount))} removido`, userName: req.user!.name } });
  res.json({ ok: true, paid: Number(updated.paid) });
}));
