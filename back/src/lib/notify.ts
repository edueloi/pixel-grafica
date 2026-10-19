// Comunicação com o cliente pelo WhatsApp a partir do sistema (documentos em PDF e avisos de texto).
import { prisma } from "../db.js";
import * as wa from "../wa/index.js";
import { record } from "../wa/conversations.js";
import { saveAttachment } from "./files.js";
import { digits, samePhone } from "./text.js";
import { HttpError } from "../routes/util.js";

function ensureReady(phone: string | null | undefined) {
  if (!digits(phone) || digits(phone).length < 10) throw new HttpError(400, "Este cliente não tem WhatsApp cadastrado. Edite o cliente e informe o número com DDD.");
  if (wa.getSessionInfo().status !== "connected") throw new HttpError(503, "O WhatsApp está desconectado. Conecte em WhatsApp > Conexão e tente de novo.");
}

// Se o cliente já tem uma conversa aberta, a mensagem enviada também aparece nela (histórico completo para a equipe)
async function openConversationOf(phone: string) {
  const list = await prisma.wppConversation.findMany({ where: { status: { in: ["bot", "waiting", "active"] }, clientPhone: { contains: digits(phone).slice(-8) } }, orderBy: { createdAt: "desc" }, take: 5 });
  return list.find((c) => samePhone(c.clientPhone, phone)) ?? null;
}

export async function sendText(phone: string | null | undefined, text: string): Promise<void> {
  ensureReady(phone);
  if (!(await wa.sendMessage(phone!, text))) throw new HttpError(502, "Não consegui enviar a mensagem pelo WhatsApp. Confira se o número está correto.");
  const conv = await openConversationOf(phone!);
  if (conv) await record(conv.id, "attendant", text.replace(/\*/g, ""));
}

export async function sendPdf(opts: {
  phone: string | null | undefined; buffer: Buffer; fileName: string; message: string; userName: string;
  customerId: string; quoteId?: string; orderId?: string;
}): Promise<void> {
  ensureReady(opts.phone);
  if (!(await wa.sendFile(opts.phone!, opts.buffer, opts.fileName, "application/pdf", opts.message))) {
    throw new HttpError(502, "Não consegui enviar o PDF pelo WhatsApp. Confira se o número está correto.");
  }
  // guarda uma cópia do documento enviado (auditoria) sem deixar a IA ler: é específico do cliente
  const att = await saveAttachment({
    buffer: opts.buffer, name: opts.fileName, mime: "application/pdf", kind: opts.orderId ? "order" : "quote", aiEnabled: false,
    uploadedBy: opts.userName, customerId: opts.customerId, quoteId: opts.quoteId, orderId: opts.orderId,
  });
  const conv = await openConversationOf(opts.phone!);
  if (conv) await record(conv.id, "attendant", `📎 ${opts.fileName}\n${opts.message}`.replace(/\*/g, ""), att.id);
}
