// Atendimento humano: fila por setor, oferta aos atendentes, aceitar, encerrar e iniciar conversa.
import { prisma } from "../db.js";
import * as tr from "./transport.js";
import { digits, samePhone, normalizePhone, cut } from "../lib/text.js";
import { notifyChange } from "../lib/events.js";
import fs from "fs";
import { filePath, saveAttachment } from "../lib/files.js";

// from/to ("HH:MM") e days (0=dom … 6=sáb) são opcionais: sem horário cadastrado, a pessoa atende a qualquer hora.
export interface Attendant { name: string; phone: string; available: boolean; from?: string; to?: string; days?: number[] }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const cleanTime = (v: unknown) => (typeof v === "string" && HHMM.test(v.trim()) ? v.trim() : undefined);
export const cleanDays = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : undefined);

export function parseAttendants(json: string | null | undefined): Attendant[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr)
      ? arr.filter((a) => a?.phone).map((a) => ({
        name: String(a.name || "Atendente"), phone: digits(a.phone), available: a.available !== false,
        from: cleanTime(a.from), to: cleanTime(a.to), days: cleanDays(a.days),
      }))
      : [];
  } catch { return []; }
}

// Está no horário de atendimento agora? (fuso do processo = America/Sao_Paulo). Janela que vira a meia-noite (22:00–02:00) é aceita.
export function onShift(a: Attendant, now = new Date()): boolean {
  if (a.days?.length && !a.days.includes(now.getDay())) return false;
  if (!a.from || !a.to) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = a.from.split(":").map(Number), [th, tm] = a.to.split(":").map(Number);
  const f = fh * 60 + fm, t = th * 60 + tm;
  return f <= t ? cur >= f && cur < t : cur >= f || cur < t;
}

const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function daysLabel(days?: number[]) {
  if (!days?.length || days.length === 7) return "todos os dias";
  if (days.join() === "1,2,3,4,5") return "de segunda a sexta";
  if (days.join() === "1,2,3,4,5,6") return "de segunda a sábado";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}
// "de segunda a sexta, das 08:00 às 18:00" — junta os horários distintos dos atendentes
export function scheduleLabel(list: Attendant[]): string {
  const parts = [...new Set(list.filter((a) => a.available && (a.from || a.days?.length)).map((a) =>
    `${daysLabel(a.days)}${a.from && a.to ? `, das ${a.from} às ${a.to}` : ""}`))];
  return parts.join(" e ");
}

type ConvLike = { clientJid?: string | null; clientPhone: string; clientName?: string | null };
export const targetOf = (c: ConvLike) => c.clientJid || c.clientPhone;
export const realPhone = (c: ConvLike) => digits(c.clientPhone).length >= 10 && digits(c.clientPhone).length <= 13;
export const clientLabel = (c: ConvLike) => c.clientName || (realPhone(c) ? c.clientPhone : "Cliente");

export async function record(conversationId: string, fromRole: "client" | "bot" | "attendant" | "system", body: string, attachmentId?: string | null) {
  await prisma.wppMessage.create({ data: { conversationId, fromRole, body, attachmentId: attachmentId ?? null } });
  await prisma.wppConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
  notifyChange(); // painel mostra a mensagem/mudança na hora
}

// Cliente cadastrado com este WhatsApp
export async function findCustomerByPhone(phone: string) {
  const d = digits(phone);
  if (d.length < 8) return null;
  const list = await prisma.customer.findMany({ where: { phone: { contains: d.slice(-8) } }, take: 10 });
  return list.find((c) => samePhone(c.phone, phone)) ?? null;
}

// ── Quem é atendente ─────────────────────────────────────────────────────────
export async function findAttendantByPhone(phone: string): Promise<{ name: string; phone: string; id?: string } | null> {
  const users = await prisma.user.findMany({ where: { active: true, phone: { not: null } } });
  const u = users.find((x) => samePhone(x.phone, phone));
  if (u) return { name: u.name, phone: digits(u.phone), id: u.id };
  const sectors = await prisma.wppSector.findMany({ where: { isActive: true } });
  for (const s of sectors) {
    const a = parseAttendants(s.attendants).find((x) => samePhone(x.phone, phone));
    if (a) return { name: a.name, phone: a.phone };
  }
  return null;
}

// ── Fila ─────────────────────────────────────────────────────────────────────
export async function queuePosition(conv: { id: string; sectorId: string | null; queuedAt: Date }) {
  const where = { status: "waiting", sectorId: conv.sectorId };
  const ahead = await prisma.wppConversation.count({ where: { ...where, queuedAt: { lt: conv.queuedAt } } });
  const total = await prisma.wppConversation.count({ where });
  return { position: ahead + 1, total };
}

// Ofertas pendentes por atendente (telefone → conversas), em memória do processo do WhatsApp
const offers = new Map<string, string[]>();

export async function offerConversation(convId: string, onlyPhone?: string) {
  const conv = await prisma.wppConversation.findUnique({ where: { id: convId }, include: { sector: true } });
  if (!conv || conv.status !== "waiting" || !conv.sector) return;

  const recent = await prisma.wppMessage.findMany({ where: { conversationId: convId, fromRole: "client" }, orderBy: { sentAt: "desc" }, take: 4 });
  const bullets = recent.reverse().map((m) => `• ${cut(m.body.replace(/\s+/g, " "), 160)}`);
  const summary = [conv.subject ? `📌 Assunto: *${conv.subject}*` : null, ...bullets].filter(Boolean).join("\n") || "• (cliente ainda não descreveu o assunto)";

  for (const att of parseAttendants(conv.sector.attendants)) {
    if (!att.available || !onShift(att)) continue;
    if (onlyPhone && !samePhone(att.phone, onlyPhone)) continue;
    // atendente já em conversa não recebe oferta (as mensagens dele iriam para o cliente)
    if (await prisma.wppConversation.findFirst({ where: { status: "active", attendantPhone: att.phone } })) continue;
    const list = offers.get(att.phone) ?? [];
    if (!list.includes(convId)) offers.set(att.phone, [...list, convId]);
    await tr.sendChoice(
      att.phone,
      `🔔 *Novo atendimento* · setor *${conv.sector.name}*\n👤 Cliente: *${clientLabel(conv)}*${realPhone(conv) && conv.clientName ? ` (${conv.clientPhone})` : ""}\n\n💬 *Resumo:*\n${summary}`,
      [{ id: "1", text: "✅ Aceitar" }, { id: "2", text: "❌ Recusar" }],
      { footer: "Aceite ou recuse este atendimento.", hint: "Responda 1 para ACEITAR ou 2 para RECUSAR." },
    );
  }
}

// Assume a conversa (atômico: só um atendente consegue). `phone` = atendente conversando pelo WhatsApp.
export async function acceptWaitingConversation(convId: string, who: { id?: string | null; name: string; phone?: string | null }) {
  const phone = who.phone ? digits(who.phone) : null;
  const claimed = await prisma.wppConversation.updateMany({
    where: { id: convId, status: { in: ["waiting", "bot"] } },
    data: { status: "active", attendantId: who.id ?? null, attendantName: who.name, attendantPhone: phone, acceptedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  const conv = await prisma.wppConversation.findUniqueOrThrow({ where: { id: convId }, include: { sector: true } });
  await record(convId, "system", `${who.name} assumiu o atendimento.`);
  setClientConversation(targetOf(conv), convId, "in_chat");
  // quem aceitou pelo WhatsApp recebe também os arquivos que o cliente já tinha mandado (fila/bot)
  if (phone) {
    const sentFiles = await prisma.wppMessage.findMany({ where: { conversationId: convId, fromRole: "client", attachmentId: { not: null } }, orderBy: { sentAt: "desc" }, take: 6 });
    for (const m of sentFiles.reverse()) {
      const att = m.attachmentId ? await prisma.attachment.findUnique({ where: { id: m.attachmentId } }) : null;
      if (!att || !fs.existsSync(filePath(att.storedName))) continue;
      await tr.sendFile(phone, fs.readFileSync(filePath(att.storedName)), att.name, att.mime, `*${clientLabel(conv)}:* ${att.name}`).catch(() => false);
    }
  }
  const greeting = `*${who.name}* iniciou o seu atendimento. 👋\nComo posso ajudar?`;
  await tr.sendText(targetOf(conv), greeting);
  await record(convId, "attendant", greeting.replace(/\*/g, ""));

  for (const [attPhone, list] of offers) {
    if (!list.includes(convId)) continue;
    offers.set(attPhone, list.filter((id) => id !== convId));
    if (!phone || !samePhone(attPhone, phone)) await tr.sendText(attPhone, `ℹ️ O atendimento de *${clientLabel(conv)}* já foi assumido por *${who.name}*.`);
  }
  return conv;
}

// Encerra e devolve o cliente ao bot
export async function closeActiveConversation(convId: string, byName: string, closingMessage?: string) {
  const conv = await prisma.wppConversation.findUnique({ where: { id: convId } });
  if (!conv || conv.status === "closed") return null;
  await prisma.wppConversation.update({ where: { id: convId }, data: { status: "closed", closedBy: "attendant", closedAt: new Date() } });
  await record(convId, "system", `${byName} finalizou o atendimento.`);
  releaseClient(targetOf(conv));
  const msg = closingMessage ?? `Atendimento encerrado por *${byName}*. Obrigado pelo contato! 💙\nSe precisar de algo, é só enviar uma mensagem.`;
  if (msg.trim()) {
    await tr.sendText(targetOf(conv), msg.trim());
    await record(convId, "bot", msg.trim().replace(/\*/g, ""));
  }
  return conv;
}

// Atendimento aceito e sem mensagens (de nenhum lado) há `minutes`: encerra, avisa o cliente e o atendente
export async function closeIdleActive(minutes: number, customMsg?: string | null) {
  const stale = await prisma.wppConversation.findMany({ where: { status: "active", updatedAt: { lt: new Date(Date.now() - minutes * 60_000) } } });
  for (const c of stale) {
    const done = await prisma.wppConversation.updateMany({ where: { id: c.id, status: "active" }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
    if (!done.count) continue;
    await record(c.id, "system", `Atendimento encerrado automaticamente: ${minutes} min sem mensagens.`);
    releaseClient(targetOf(c));
    const first = (clientLabel(c) || "").trim().split(/\s+/)[0];
    const msg = (customMsg?.trim() || "Como não recebemos resposta há um tempo, encerramos este atendimento por aqui. 💙\nSe ainda estiver por aí ou precisar de algo, é só mandar uma mensagem que a gente retoma!")
      .replace(/\{nome\}/gi, realPhone({ clientPhone: first }) ? "" : first).replace(/[ ]+([!,.?])/g, "$1");
    try { await tr.sendText(targetOf(c), msg); await record(c.id, "bot", msg.replace(/\*/g, "")); } catch (e) { console.error("[wa] aviso de encerramento:", e); }
    if (c.attendantPhone) await tr.sendText(c.attendantPhone, `ℹ️ O atendimento de *${clientLabel(c)}* foi encerrado por inatividade (${minutes} min sem mensagens).`).catch(() => {});
  }
}

// Transferir para outro setor: volta para a fila do novo setor e avisa os atendentes dele
export async function transferConversation(convId: string, sectorId: string, byName: string) {
  const sector = await prisma.wppSector.findUnique({ where: { id: sectorId } });
  if (!sector) return null;
  await prisma.wppConversation.update({
    where: { id: convId },
    data: { sectorId, status: "waiting", queuedAt: new Date(), attendantId: null, attendantName: null, attendantPhone: null, acceptedAt: null },
  });
  const conv = await prisma.wppConversation.findUniqueOrThrow({ where: { id: convId } });
  await record(convId, "system", `${byName} transferiu o atendimento para o setor ${sector.name}.`);
  setClientConversation(targetOf(conv), convId, "waiting");
  await tr.sendText(targetOf(conv), `Vou encaminhar você ao setor *${sector.name}*. Já já alguém continua o atendimento. 💙`);
  void offerConversation(convId);
  return conv;
}

// Transferir direto para uma pessoa: ela assume na hora (sem fila) e, se tiver WhatsApp cadastrado, é avisada e pode responder por lá
export async function transferToPerson(convId: string, userId: string, byName: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const [conv, user] = await Promise.all([
    prisma.wppConversation.findUnique({ where: { id: convId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!conv || conv.status === "closed") return { ok: false, error: "Esta conversa já foi encerrada." };
  if (!user || !user.active) return { ok: false, error: "Pessoa não encontrada ou sem acesso ativo." };
  if (conv.status === "active" && conv.attendantId === user.id) return { ok: false, error: `${user.name} já está com este atendimento.` };

  const phone = user.phone ? digits(user.phone) : null;
  await prisma.wppConversation.update({
    where: { id: convId },
    data: { status: "active", attendantId: user.id, attendantName: user.name, attendantPhone: phone, acceptedAt: new Date() },
  });
  setClientConversation(targetOf(conv), convId, "in_chat");
  await record(convId, "system", `${byName} transferiu o atendimento para ${user.name}.`);

  const greeting = `Vou passar você para *${user.name}*, que continua o seu atendimento. 💙`;
  await tr.sendText(targetOf(conv), greeting);
  await record(convId, "bot", greeting.replace(/\*/g, ""));

  if (phone) {
    const last = await prisma.wppMessage.findMany({ where: { conversationId: convId, fromRole: "client" }, orderBy: { sentAt: "desc" }, take: 3 });
    const resumo = last.reverse().map((m) => `• ${cut(m.body.replace(/\s+/g, " "), 140)}`).join("\n") || "• (sem mensagens do cliente ainda)";
    await tr.sendText(phone, `🔁 *${byName}* transferiu para você o atendimento de *${clientLabel(conv)}*.\n\n${resumo}\n\nTudo que escrever aqui vai para o cliente. Digite *&fim* para encerrar.`);
  }
  return { ok: true, name: user.name };
}

// O atendente começa a conversa pelo painel: confere o número e envia a primeira mensagem
export async function startConversation(input: { phone: string; name?: string | null; message: string; attendantId?: string | null; attendantName: string; sectorId?: string | null }) {
  const raw = digits(input.phone);
  if (raw.length < 10 || raw.length > 13) return { ok: false as const, error: "Informe o telefone com DDD (ex.: 15 99999-9999)." };
  if (!input.message?.trim()) return { ok: false as const, error: "Escreva a primeira mensagem." };
  if (tr.getSessionInfo().status !== "connected") return { ok: false as const, error: "O WhatsApp não está conectado." };

  const phone = normalizePhone(raw);
  const customer = await findCustomerByPhone(phone);
  const existing = await prisma.wppConversation.findFirst({ where: { clientPhone: phone, status: { in: ["bot", "waiting", "active"] } } });
  if (existing && existing.status === "active" && existing.attendantId !== input.attendantId) {
    return { ok: false as const, error: `Já existe um atendimento em andamento com ${existing.attendantName ?? "outro atendente"}.` };
  }
  const data = {
    status: "active", attendantId: input.attendantId ?? null, attendantName: input.attendantName, attendantPhone: null,
    acceptedAt: new Date(), sectorId: input.sectorId ?? null, customerId: customer?.id ?? null,
    clientName: input.name?.trim() || customer?.name || null,
  };
  const conv = existing
    ? await prisma.wppConversation.update({ where: { id: existing.id }, data })
    : await prisma.wppConversation.create({ data: { ...data, clientPhone: phone, firstMessage: cut(input.message, 1000) } });

  const ok = await tr.sendText(targetOf(conv), input.message.trim());
  if (!ok) return { ok: false as const, error: "Não consegui enviar. Confira o número." };
  setClientConversation(targetOf(conv), conv.id, "in_chat");
  await record(conv.id, "system", `${input.attendantName} iniciou a conversa.`);
  await record(conv.id, "attendant", input.message.trim());
  return { ok: true as const, id: conv.id };
}

// ── Estado em memória de quem está com humano (o bot fica em silêncio) ───────
export interface ClientState {
  nodeId: string | null; mode: "menu" | "ai"; remoteJid: string; lastActivity: number;
  pushName?: string | null; conversationId?: string; status?: "waiting" | "in_chat"; aiTurns?: number;
  awaitingName?: boolean; pendingText?: string; // pergunta do nome: aguardando resposta (e o que ele escreveu antes)
}
export const clientStates = new Map<string, ClientState>();
export const stateKey = (jid: string) => tr.jidToPhone(tr.toJid(jid));

export function setClientConversation(target: string, conversationId: string, status: "waiting" | "in_chat") {
  const key = stateKey(target);
  const s = clientStates.get(key) ?? { nodeId: null, mode: "menu" as const, remoteJid: tr.toJid(target), lastActivity: Date.now() };
  s.conversationId = conversationId; s.status = status;
  clientStates.set(key, s);
}
export const releaseClient = (target: string) => { clientStates.delete(stateKey(target)); };

// ── Atendente falando com o bot pelo WhatsApp ────────────────────────────────
// Foto, documento, vídeo ou áudio que o atendente manda pelo próprio WhatsApp: vai para o cliente do atendimento dele
export async function handleAttendantMedia(att: { name: string; phone: string }, media: { buffer: Buffer; mime: string; fileName: string; kind: string }, caption: string): Promise<boolean> {
  const mine = await prisma.wppConversation.findFirst({ where: { status: "active", attendantPhone: att.phone }, orderBy: { acceptedAt: "desc" } });
  if (!mine) return false;
  const saved = await saveAttachment({ buffer: media.buffer, name: media.fileName, mime: media.mime, kind: "chat", conversationId: mine.id, customerId: mine.customerId, uploadedBy: att.name });
  const ok = await tr.sendFile(targetOf(mine), media.buffer, media.fileName, media.mime, caption || undefined);
  if (!ok) { await tr.sendText(att.phone, "⚠️ Não consegui enviar este arquivo ao cliente. Tente de novo."); return true; }
  const label = media.kind === "audio" ? "🎤 Áudio" : `📎 ${saved.name}`;
  await record(mine.id, "attendant", caption ? `${label}
${caption}` : label, saved.id);
  return true;
}

export async function handleAttendantMessage(att: { name: string; phone: string; id?: string }, text: string): Promise<boolean> {
  const t = text.trim();
  const pending = offers.get(att.phone) ?? [];

  const mine = await prisma.wppConversation.findFirst({ where: { status: "active", attendantPhone: att.phone }, orderBy: { acceptedAt: "desc" } });
  if (mine) {
    if (/^&(fim|sair|encerrar)$/i.test(t)) {
      await closeActiveConversation(mine.id, att.name);
      await tr.sendText(att.phone, `✅ Atendimento de *${clientLabel(mine)}* encerrado.`);
      return true;
    }
    await tr.sendText(targetOf(mine), t);
    await record(mine.id, "attendant", t);
    return true;
  }

  if (pending.length && (t === "1" || t === "2")) {
    const convId = pending[0];
    offers.set(att.phone, pending.slice(1));
    if (t === "2") { await tr.sendText(att.phone, "Ok, recusado. 👍"); return true; }
    const conv = await acceptWaitingConversation(convId, { id: att.id, name: att.name, phone: att.phone });
    await tr.sendText(att.phone, conv
      ? `✅ Você assumiu o atendimento de *${clientLabel(conv)}*. Tudo que escrever aqui vai para o cliente.\nDigite *&fim* para encerrar.`
      : "ℹ️ Este atendimento já foi assumido por outra pessoa.");
    return true;
  }
  return false;
}
