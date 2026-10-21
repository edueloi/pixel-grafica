// Anotações do atendimento: a IA lê a conversa e monta uma ficha organizada (pedido, gostos, o que evitar, arquivos, pendências).
// Fica salva no cliente, no orçamento aberto e na conversa; quem aceita pelo WhatsApp também recebe o texto.
import { prisma } from "../db.js";
import { completeText } from "./ai.js";
import { findCustomerByPhone, record, clientLabel } from "./conversations.js";
import * as tr from "./transport.js";
import { cut } from "../lib/text.js";

const SYSTEM = `Você prepara a ficha de atendimento de uma gráfica rápida para a pessoa que vai atender o cliente. Leia a conversa e escreva anotações curtas e úteis.
REGRAS: use SOMENTE o que está na conversa e nos dados fornecidos; não invente nada; não repita saudações nem conversa fiada. Escreva em português, em tópicos com "•", sem markdown além de *negrito* nos títulos das seções.
SEÇÕES (use só as que tiverem informação, nesta ordem e com estes títulos exatos):
*Pedido:* o que o cliente quer (produto, quantidade, finalidade).
*Gostos e preferências:* cores, estilo, referências, o que ele disse que gosta.
*Evitar / não gosta:* o que ele disse que não quer ou não gosta (ex.: cores fortes).
*Medidas, material e acabamento:*
*Prazo e entrega:*
*Arquivos recebidos:* o que foi enviado (logo, arte, foto, PDF) e o que o cliente disse sobre cada um.
*Pendências:* o que ainda falta confirmar ou receber do cliente.
Máximo de 900 caracteres no total.`;

const ROLE: Record<string, string> = { client: "Cliente", bot: "Assistente", attendant: "Atendente" };

export async function createBriefing(convId: string, opts: { title?: string; sendToPhone?: string | null; by?: string } = {}) {
  const conv = await prisma.wppConversation.findUnique({ where: { id: convId } });
  if (!conv) return null;
  const rows = (await prisma.wppMessage.findMany({ where: { conversationId: convId, fromRole: { in: ["client", "bot", "attendant"] } }, orderBy: { sentAt: "desc" }, take: 60 })).reverse();
  const clientMsgs = rows.filter((m) => m.fromRole === "client");
  if (!clientMsgs.length) return null;

  const customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
  const quote = customer ? await prisma.quote.findFirst({ where: { customerId: customer.id, status: { in: ["rascunho", "enviado"] } }, orderBy: { createdAt: "desc" }, include: { items: true } }) : null;
  const attIds = rows.filter((m) => m.fromRole === "client" && m.attachmentId).map((m) => m.attachmentId!);
  const files = attIds.length ? await prisma.attachment.findMany({ where: { id: { in: attIds } }, select: { name: true, mime: true } }) : [];

  const transcript = rows.map((m) => `${ROLE[m.fromRole]}: ${cut(m.body.replace(/\s+/g, " "), 400)}`).join("\n");
  const prompt = [
    `Cliente: ${clientLabel(conv)}${customer?.company ? ` (${customer.company})` : ""}`,
    files.length ? `Arquivos enviados pelo cliente: ${files.map((f) => `${f.name} [${f.mime}]`).join("; ")}` : "Arquivos enviados pelo cliente: nenhum",
    quote ? `Orçamento em aberto #${quote.number}: ${quote.items.map((i) => i.description).join("; ")}` : "",
    "", "CONVERSA:", transcript,
  ].filter((l) => l !== "").join("\n");

  let body = await completeText(SYSTEM, prompt, 700);
  if (!body) {
    // sem IA: ficha simples a partir do que o cliente escreveu
    body = [
      `*Pedido:* ${cut(conv.subject || conv.firstMessage || clientMsgs[0].body, 200)}`,
      `*O que o cliente escreveu:*\n${clientMsgs.slice(-5).map((m) => `• ${cut(m.body.replace(/\s+/g, " "), 160)}`).join("\n")}`,
      files.length ? `*Arquivos recebidos:*\n${files.map((f) => `• ${f.name}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  }
  body = body.replace(/\*\*/g, "*").slice(0, 3000);

  const day = new Date().toLocaleDateString("pt-BR");
  const note = await prisma.note.create({
    data: {
      title: `${opts.title ?? "Anotações do atendimento"} · ${day}`, body, source: "ia", createdBy: opts.by ?? "Pixel IA",
      conversationId: conv.id, customerId: customer?.id ?? conv.customerId ?? null, quoteId: quote?.id ?? null,
    },
  });
  await record(conv.id, "system", `📝 ${opts.title ?? "Anotações do atendimento"}\n${body}`);
  if (opts.sendToPhone) {
    await tr.sendText(opts.sendToPhone, `📝 *${opts.title ?? "Anotações do atendimento"}* — ${clientLabel(conv)}\n\n${body}`).catch(() => {});
  }
  return note;
}
