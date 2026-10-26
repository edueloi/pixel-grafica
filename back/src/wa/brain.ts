// Cérebro do bot: menus com botões → conhecimento pronto → Pixel IA → atendente humano.
import { prisma } from "../db.js";
import * as tr from "./transport.js";
import { generateReply, isAiAvailable, transcribeAudio } from "./ai.js";
import { saveAttachment } from "../lib/files.js";
import { strip, cut, normalizePhone, samePhone } from "../lib/text.js";
import {
  record, findCustomerByPhone, findAttendantByPhone, handleAttendantMessage, handleAttendantMedia, offerConversation, queuePosition,
  clientStates, stateKey, targetOf, clientLabel, parseAttendants, onShift, scheduleLabel, closeIdleActive, realPhone, type ClientState,
} from "./conversations.js";

const MENU_WORDS = /^(menu|inicio|início|voltar|0)[\s!.,?]*$/i;
const GREETING = /^(oi+|olá|ola|oie|ei|opa|hello|hi|bom dia|boa tarde|boa noite|e a[ií]|eae|tudo bem)[\s!.,?]*$/i;
// Pedido claro de falar com uma pessoa: atende na hora (mesmo sem IA), no setor que combina com o assunto.
const HUMAN_REQUEST = /\b(atendente|atendimento humano|humano|vendedor|vendedora|gerente|respons[aá]vel|dono|dona)\b|falar com (uma |um )?(pessoa|alguem|alguém|gente)|pessoa de verdade|tem algu[eé]m/i;
function sectorForHuman(text: string): string {
  const t = strip(text);
  if (/arte|logo|criacao|layout|design/.test(t)) return "Arte e Criação";
  if (/pagamento|pagar|boleto|nota fiscal|financeiro|cobranca/.test(t)) return "Financeiro";
  if (/meu pedido|entrega|retirar|retirada|andamento|status/.test(t)) return "Acompanhar pedido";
  return "Orçamentos";
}
const pickOne = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const SESSION_IDLE_MS = 60 * 60 * 1000;
const returnMs = (c?: { returnAfterMin?: number | null } | null) => (c?.returnAfterMin && c.returnAfterMin > 0 ? c.returnAfterMin : 60) * 60_000;

// Cliente que veio do site: a mensagem traz "pedido nº 12 pelo site". Se o número existir e for do mesmo WhatsApp que fez o pedido,
// a conversa já nasce ligada ao cliente e ao assunto (a IA recebe os itens e o total por customerBlock).
const SITE_ORDER = /(?:pedido|or[cç]amento)\s*(?:n[ºo°.]*\s*)?#?\s*(\d{1,7})\b[^\n]*\bsite\b/i;
async function linkSiteOrder<T extends { id: string; subject?: string | null }>(conv: T, text: string, clientPhone: string): Promise<T> {
  const m = SITE_ORDER.exec(text);
  if (!m) return conv;
  const number = Number(m[1]);
  const quote = await prisma.quote.findFirst({ where: { number, source: "site" }, include: { customer: true } });
  if (!quote || !samePhone(quote.customer.phone, clientPhone)) return conv; // só vale para quem fez o pedido (não vaza dados por palpite de número)
  return (await prisma.wppConversation.update({ where: { id: conv.id }, data: { customerId: quote.customerId, clientName: quote.customer.name, subject: `Pedido nº ${number} (pelo site)` } })) as unknown as T;
}

// Nome "de verdade": tem letras (não só número, emoji ou pontuação)
const isRealName = (n?: string | null) => !!n && /\p{L}{2,}/u.test(n.trim()) && !/^\+?[\d\s()-]+$/.test(n.trim());
// Resposta à pergunta "como posso te chamar?": só aceita algo que pareça um nome (até 4 palavras, só letras)
function parseName(raw: string): string | null {
  const t = raw.trim().replace(/^(meu nome (é|e)|me chamo|pode me chamar de|sou (o|a)|aqui (é|e) (o|a)?|é|e)\s+/i, "").replace(/[.!]+$/, "").trim();
  if (!/^\p{L}[\p{L}'’.\- ]{1,39}$/u.test(t) || t.split(/\s+/).length > 4) return null;
  return t.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
// Cadastra (ou atualiza) o cliente com o nome informado e liga à conversa
async function registerClientName(conv: { id: string; clientPhone: string; customerId: string | null }, name: string) {
  let customerId = conv.customerId;
  if (!customerId && realPhone({ clientPhone: conv.clientPhone })) {
    const found = await findCustomerByPhone(conv.clientPhone);
    customerId = (found ?? await prisma.customer.create({ data: { name, phone: normalizePhone(conv.clientPhone) } })).id;
  }
  await prisma.wppConversation.update({ where: { id: conv.id }, data: { clientName: name, ...(customerId ? { customerId } : {}) } });
  await prisma.wppContactMemory.upsert({ where: { phone: conv.clientPhone }, create: { phone: conv.clientPhone, name }, update: { name } }).catch(() => {});
  return customerId;
}
const OFFER_DELAY_MS = 2500;

export const saudacao = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};
const firstName = (n?: string | null) => (n ? n.trim().split(/\s+/)[0] : null);
const fill = (t: string, pushName?: string | null) =>
  t.replace(/\{saudacao\}/gi, saudacao()).replace(/\{nome\}/gi, firstName(pushName) ?? "").replace(/[ ]+([!,.?])/g, "$1");

export function initBot() { tr.setIncomingHandler(handleMessage); }

async function botSay(state: ClientState, text: string, convId?: string) {
  const id = convId ?? state.conversationId;
  await tr.typing(state.remoteJid, text);
  await tr.sendText(state.remoteJid, text);
  if (id) await record(id, "bot", text.replace(/\*/g, ""));
}

// Respostas longas da IA viram até 3 balões, como uma pessoa digitando
async function botSayBubbles(state: ClientState, text: string) {
  const all = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // no máximo 3 balões; o que passar disso entra no último (nunca descarta parte da resposta)
  const parts = all.length > 3 ? [all[0], all[1], all.slice(2).join("\n\n")] : all;
  for (const p of parts.length ? parts : [text]) await botSay(state, p);
}

// ── Base de conhecimento (respostas prontas) ─────────────────────────────────
// {horario} {endereco} {pagamento} {entrega} {telefone} {instagram} vêm de "Dados da empresa"
const COMPANY_TOKENS: Record<string, "hours" | "address" | "payment" | "delivery" | "phone" | "instagram"> = {
  horario: "hours", endereco: "address", pagamento: "payment", entrega: "delivery", telefone: "phone", instagram: "instagram",
};

// Preenche os dados reais da empresa. Se algum dado usado na resposta não estiver preenchido, devolve null (a resposta não é usada).
export async function fillCompany(answer: string): Promise<string | null> {
  const used = [...answer.matchAll(/\{(\w+)\}/g)].map((m) => m[1].toLowerCase()).filter((t) => t in COMPANY_TOKENS);
  if (!used.length) return answer;
  const c = await prisma.companyProfile.findFirst();
  let out = answer;
  for (const t of used) {
    const v = c?.[COMPANY_TOKENS[t]]?.trim();
    if (!v) return null;
    out = out.replace(new RegExp(`\\{${t}\\}`, "gi"), v);
  }
  return out;
}

async function matchKnowledge(text: string) {
  const flat = strip(text);
  const all = await prisma.wppKnowledge.findMany({ where: { enabled: true } });
  let best: { k: (typeof all)[number]; score: number; answer: string } | null = null;
  for (const k of all) {
    const hit = k.phrases.split("\n").map(strip).filter((p) => p.length >= 3 && flat.includes(p)).sort((a, b) => b.length - a.length)[0];
    if (!hit || (best && hit.length <= best.score)) continue;
    const answer = await fillCompany(k.answer); // null = a resposta usa um dado da empresa que ainda não foi preenchido: não responde com texto vazio
    if (answer !== null) best = { k, score: hit.length, answer };
  }
  return best && best.score >= 4 ? { ...best.k, answer: best.answer } : null;
}

// ── Setor / fila ─────────────────────────────────────────────────────────────
const positionText = (name: string, p: { position: number; total: number }) =>
  p.position <= 1 ? `Você é o próximo na fila do setor *${name}*. ⏳` : `Você está na posição *${p.position}* da fila do setor *${name}*. ⏳`;

async function handoffToSector(state: ClientState, conv: { id: string; clientPhone: string }, sectorRef: { id?: string; name?: string }, note?: string) {
  const sectors = await prisma.wppSector.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const wanted = strip(sectorRef.name ?? "");
  const sector = (sectorRef.id ? sectors.find((s) => s.id === sectorRef.id) : null)
    ?? sectors.find((s) => wanted && (strip(s.name).includes(wanted) || wanted.includes(strip(s.name)))) ?? sectors[0];
  if (!sector) { await botSay(state, "No momento não consegui localizar um setor disponível. Tente novamente em instantes. 🙏", conv.id); return; }

  const updated = await prisma.wppConversation.update({
    where: { id: conv.id },
    data: { sectorId: sector.id, status: "waiting", queuedAt: new Date(), ...(note ? { subject: cut(note, 255) } : {}) },
  });
  state.conversationId = conv.id; state.status = "waiting";
  clientStates.set(stateKey(state.remoteJid), state);
  const pos = await queuePosition(updated);
  await record(conv.id, "system", `Cliente encaminhado ao setor ${sector.name}.${note ? ` ${note}` : ""}`);
  await botSay(state, `Certo! Estou encaminhando você ao setor *${sector.name}*. 💙\n\n${positionText(sector.name, pos)}\nEnquanto isso, pode descrever o que precisa ou enviar seus arquivos por aqui. ✍️`, conv.id);
  // ninguém do setor está no horário de atendimento agora: avisa o cliente (a conversa fica na fila para quando a equipe voltar)
  const team = parseAttendants(sector.attendants).filter((a) => a.available);
  if (team.length && !team.some((a) => onShift(a))) {
    const cfg = await prisma.wppBotConfig.findFirst();
    const when = scheduleLabel(team);
    const msg = cfg?.offHoursMsg?.trim()
      ? cfg.offHoursMsg.replace(/\{horario\}/gi, when || "nosso horário de atendimento")
      : `No momento estamos sem atendentes no horário. 🕐${when ? `
Nosso atendimento é ${when}.` : ""}
Deixe sua mensagem por aqui que respondemos assim que a equipe voltar. 💙`;
    await botSay(state, msg, conv.id);
    return;
  }
  setTimeout(() => { offerConversation(conv.id).catch((e) => console.error("[wa] erro ao avisar atendentes:", e)); }, OFFER_DELAY_MS);
}

// ── Nós do menu ──────────────────────────────────────────────────────────────
async function processNode(node: any, state: ClientState, conv: { id: string; clientPhone: string }) {
  const text = fill(node.content || "", state.pushName);
  if (node.type === "menu" || node.type === "message") state.nodeId = node.id;

  if (node.type === "menu") {
    let options: { key: string; label: string }[] = [];
    try { options = JSON.parse(node.options || "[]"); } catch { /* sem opções */ }
    const body = text || "Escolha uma opção:";
    await tr.sendChoice(state.remoteJid, body, options.map((o) => ({ id: String(o.key), text: String(o.label) })), { hint: "Toque em uma opção ou digite o número." });
    await record(conv.id, "bot", `${body}\n\n${options.map((o) => `${o.key} - ${o.label}`).join("\n")}`);
    state.mode = "menu";
  } else if (node.type === "message") {
    state.mode = "menu";
    await botSay(state, text || "…", conv.id);
  } else if (node.type === "ai") {
    // sem IA configurada, o nó que tem setor de reserva encaminha para a equipe em vez de deixar o cliente sem resposta
    if (node.sectorId && !(await isAiAvailable())) {
      await handoffToSector(state, conv, { id: node.sectorId }, node.title);
      return;
    }
    state.mode = "ai"; state.aiTurns = 0;
    await botSay(state, text || "Pode me contar o que você precisa. 😊", conv.id);
  } else if (node.type === "sector") {
    await handoffToSector(state, conv, { id: node.sectorId ?? undefined }, node.title);
  } else if (node.type === "end") {
    if (text) await botSay(state, text, conv.id);
    await prisma.wppConversation.update({ where: { id: conv.id }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
    clientStates.delete(stateKey(state.remoteJid));
  }
}

async function sendStart(state: ClientState, conv: { id: string; clientPhone: string }) {
  const start = await prisma.wppFlowNode.findFirst({ where: { isStart: true, isActive: true } });
  if (!start) { await botSay(state, fill("{saudacao}! Como posso ajudar?", state.pushName), conv.id); return; }
  await processNode(start, state, conv);
}

// Texto livre: resposta pronta → IA. Devolve false se nada respondeu.
// Pergunta de preço/quantidade (número, "quanto", "valor", "orçamento"…): a IA responde com as ferramentas de preço,
// em vez de uma resposta pronta que pegaria só um pedaço da frase (ex.: "mando a arte pronta, quanto fica 1000 cartões?").
const PRICE_INTENT = /\d|quanto|valor|preco|orcamento|custa|sai\b|fica\b|cobra/;

async function answerWithKnowledge(state: ClientState, conv: any, text: string): Promise<boolean> {
  const k = await matchKnowledge(text);
  if (!k) return false;
  await prisma.wppKnowledge.update({ where: { id: k.id }, data: { hits: { increment: 1 } } }).catch(() => {});
  await botSayBubbles(state, fill(k.answer, state.pushName));
  if (k.action.startsWith("handoff:")) await handoffToSector(state, conv, { name: k.action.slice(8) }, k.title);
  else if (k.action === "menu") await sendStart(state, conv);
  return true;
}

async function answerWithAi(state: ClientState, conv: any, text: string): Promise<boolean> {
  const r = await generateReply({ id: conv.id, subject: conv.subject, clientPhone: conv.clientPhone, clientJid: conv.clientJid, clientName: conv.clientName ?? state.pushName, customerId: conv.customerId }, text);
  if (!r) return false;
  if (r.text) await botSayBubbles(state, r.text);
  if (r.handoff) await handoffToSector(state, conv, { name: r.handoff.sector }, r.handoff.reason);
  return !!(r.text || r.handoff);
}

async function answerFree(state: ClientState, conv: any, text: string): Promise<boolean> {
  if (PRICE_INTENT.test(strip(text))) {
    // preço/quantidade: IA primeiro; se ela estiver desligada ou falhar, a resposta pronta ainda ajuda
    return (await answerWithAi(state, conv, text)) || (await answerWithKnowledge(state, conv, text));
  }
  return (await answerWithKnowledge(state, conv, text)) || (await answerWithAi(state, conv, text));
}

// ── Mensagem recebida ────────────────────────────────────────────────────────
export async function handleMessage(msg: any, _sock: any) {
  if (!msg.message || msg.key.fromMe || tr.isIgnorableJid(msg.key.remoteJid!)) return;

  const rawJid: string = msg.key.remoteJid!;
  const key = stateKey(rawJid);
  const clientPhone = normalizePhone(await tr.resolvePhone(msg));
  const pushName: string | null = msg.pushName || null;
  let text = tr.extractIncomingText(msg.message).trim();
  const media = await tr.downloadIncomingMedia(msg);
  if (!text && !media) return;

  // Mensagem de um atendente cadastrado (aceitar/recusar/conversar pelo bot)?
  {
    const att = await findAttendantByPhone(clientPhone);
    if (att && (media ? await handleAttendantMedia(att, media, text) : await handleAttendantMessage(att, text))) return;
  }

  let conv = await prisma.wppConversation.findFirst({
    where: { status: { in: ["bot", "waiting", "active"] }, OR: [{ clientJid: rawJid }, { clientPhone }] },
    orderBy: { createdAt: "desc" },
  });

  // Conversa só com o bot, parada há muito tempo: encerra e começa outra
  const config = await prisma.wppBotConfig.findFirst();
  if (conv?.status === "bot" && Date.now() - conv.updatedAt.getTime() > returnMs(config)) {
    await prisma.wppConversation.update({ where: { id: conv.id }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
    conv = null; clientStates.delete(key);
  }

  if (!conv && !config?.botEnabled) return;

  let state = clientStates.get(key);
  let isNew = false, returning = false;

  // Nova conversa: vincula ao cliente cadastrado (se houver)
  if (!conv) {
    isNew = true;
    const previous = await prisma.wppConversation.findFirst({ where: { OR: [{ clientJid: rawJid }, { clientPhone }] }, orderBy: { updatedAt: "desc" } });
    returning = !!previous && Date.now() - previous.updatedAt.getTime() > returnMs(config);
    const customer = await findCustomerByPhone(clientPhone);
    conv = await prisma.wppConversation.create({
      data: { clientPhone, clientJid: rawJid, clientName: customer?.name ?? pushName, customerId: customer?.id ?? null, firstMessage: cut(text || "Enviou um arquivo", 1000), status: "bot" },
    });
    await prisma.wppContactMemory.upsert({
      where: { phone: clientPhone },
      create: { phone: clientPhone, name: pushName }, update: { visits: { increment: 1 }, lastSeenAt: new Date(), ...(pushName ? { name: pushName } : {}) },
    }).catch(() => {});
    state = undefined;
  } else if (!conv.clientJid || (!conv.clientName && pushName)) {
    conv = await prisma.wppConversation.update({ where: { id: conv.id }, data: { clientJid: conv.clientJid ?? rawJid, ...(conv.clientName ? {} : { clientName: pushName }) } });
  }

  if (!conv.subject && text) conv = await linkSiteOrder(conv, text, clientPhone);

  // Arquivo do cliente (arte, logo, PDF…): guarda e anexa à conversa
  let attachmentId: string | null = null;
  if (media) {
    const att = await saveAttachment({ buffer: media.buffer, name: media.fileName, mime: media.mime, kind: "chat", conversationId: conv.id, customerId: conv.customerId, uploadedBy: clientLabel(conv) });
    attachmentId = att.id;
    if (!text) text = `📎 ${att.name}`;
  }
  // Áudio: transcreve para o bot (e para o atendente ler) em vez de tratar como arquivo
  const isAudio = media?.kind === "audio";
  let heard: string | null = null;
  if (isAudio) {
    heard = await transcribeAudio(media!.buffer, media!.mime);
    text = heard ? `🎤 ${heard}` : "🎤 Áudio (não consegui transcrever)";
  }
  await record(conv.id, "client", text, attachmentId);

  state = state ?? { nodeId: null, mode: "menu", remoteJid: rawJid, lastActivity: Date.now(), pushName };
  state.conversationId = conv.id; state.pushName = pushName ?? state.pushName; state.lastActivity = Date.now();
  clientStates.set(key, state);

  // Na fila ou em atendimento: só registra (o bot fica quieto) e repassa ao atendente
  if (conv.status === "waiting" || conv.status === "active") {
    state.status = conv.status === "active" ? "in_chat" : "waiting";
    if (conv.status === "waiting" && /^(fila|posi[cç][aã]o|minha posi[cç][aã]o|status)$/i.test(text)) {
      const sector = conv.sectorId ? await prisma.wppSector.findUnique({ where: { id: conv.sectorId } }) : null;
      await botSay(state, positionText(sector?.name ?? "de atendimento", await queuePosition(conv)), conv.id);
      return;
    }
    if (conv.status === "active" && conv.attendantPhone) {
      // foto/arquivo/áudio do cliente vai de verdade para o atendente (não só o aviso de que existe)
      const sent = media ? await tr.sendFile(conv.attendantPhone, media.buffer, media.fileName, media.mime, `*${clientLabel(conv)}:* ${text}`) : false;
      if (!sent) await tr.sendText(conv.attendantPhone, `*${clientLabel(conv)}:* ${text}`);
    }
    return;
  }

  // ── Bot ────────────────────────────────────────────────────────────────────
  // Respondendo "como posso te chamar?": cadastra o cliente e segue a conversa (retoma o que ele tinha escrito)
  if (state.awaitingName) {
    state.awaitingName = false;
    const name = media ? null : parseName(text);
    const pending = state.pendingText; state.pendingText = undefined;
    if (name) {
      await registerClientName(conv, name);
      conv = { ...conv, clientName: name };
      state.pushName = name;
      if (!pending) { await botSay(state, `Prazer, ${name.split(" ")[0]}! 😊 Como posso te ajudar?`, conv.id); return; }
      await botSay(state, `Prazer, ${name.split(" ")[0]}! 😊`, conv.id);
      text = pending; // segue respondendo o que ele pediu no começo
    }
    // não parecia um nome (ele já foi direto ao assunto): segue normalmente, sem insistir
  } else if (isNew && !media && config?.askName !== false && !conv.customerId && !isRealName(pushName)) {
    state.awaitingName = true;
    state.pendingText = GREETING.test(text) || text.length < 4 ? undefined : text;
    await botSay(state, `${saudacao()}! Eu sou a assistente virtual da Pixel Gráfica. 😊 Antes de começar, como posso te chamar?`, conv.id);
    return;
  }

  // Cliente que volta depois de um tempo e só cumprimenta: recebe um "de volta" em vez de recomeçar do menu
  if (returning && !media && GREETING.test(text)) {
    const first = firstName(state.pushName ?? conv.clientName);
    const tpl = config?.welcomeBackMsg?.trim();
    const msg = tpl ? fill(tpl, first) : `${saudacao()}${first ? `, ${first}` : ""}! Que bom te ver de volta. 😊 Como posso te ajudar hoje?`;
    await botSay(state, msg, conv.id);
    if (await isAiAvailable()) { state.mode = "ai"; state.aiTurns = 0; } else await sendStart(state, conv);
    return;
  }

  if (isAudio) {
    if (heard) text = heard; // a conversa segue como se ele tivesse escrito
    else {
      await botSay(state, pickOne(["Recebi seu áudio, mas não consegui ouvir direito aqui. 😅 Pode escrever pra mim o que você precisa? Se preferir, chamo alguém da equipe.", "Opa, o áudio não abriu pra mim. Consegue mandar de novo ou escrever? Se for mais fácil, chamo alguém da equipe pra te ouvir. 🙏"]), conv.id);
      return;
    }
  } else if (media) {
    // arquivo precisa de olho humano: encaminha para a equipe
    await handoffToSector(state, conv, { name: "Orçamentos" }, "Cliente enviou arquivo");
    return;
  }

  // Pediu uma pessoa: chama a equipe com uma frase simpática, sem cair no menu
  if (HUMAN_REQUEST.test(text) && text.length < 160) {
    const name = (state.pushName ?? "").trim().split(/\s+/)[0];
    await botSay(state, `Claro${name ? `, ${name}` : ""}! Já vou chamar alguém da equipe pra te atender. 😊`, conv.id);
    await handoffToSector(state, conv, { name: sectorForHuman(text) }, "Cliente pediu para falar com uma pessoa");
    return;
  }

  // Com a IA ligada, quem conversa é ela desde a primeira mensagem ("oi", "bom dia", "quero um orçamento"): nada de menu na cara.
  // O menu continua à mão: o cliente digita "menu" (ou "0"/"voltar") e ele aparece.
  const aiOn = await isAiAvailable();
  const firstContact = !state.nodeId && state.mode === "menu";
  if (aiOn && !MENU_WORDS.test(text) && (firstContact || state.mode === "ai" || GREETING.test(text))) {
    if (state.mode !== "ai") { state.mode = "ai"; state.aiTurns = 0; }
    if (await answerWithAi(state, conv, text)) { state.aiTurns = (state.aiTurns ?? 0) + 1; return; }
    // a IA falhou nesta mensagem: cai nas respostas prontas abaixo
  }
  if (MENU_WORDS.test(text) || GREETING.test(text) || (firstContact && !aiOn)) {
    state.mode = "menu";
    await sendStart(state, conv);
    return;
  }

  if (state.mode === "menu" && state.nodeId) {
    const node = await prisma.wppFlowNode.findUnique({ where: { id: state.nodeId } });
    if (node?.type === "menu") {
      let options: { key: string; label: string; nextNodeId?: string }[] = [];
      try { options = JSON.parse(node.options || "[]"); } catch { /* sem opções */ }
      const flat = strip(text);
      const chosen = options.find((o) => strip(String(o.key)) === flat) ?? options.find((o) => strip(String(o.label)) === flat);
      if (chosen?.nextNodeId) {
        const next = await prisma.wppFlowNode.findUnique({ where: { id: chosen.nextNodeId } });
        if (next && next.isActive) { await processNode(next, state, conv); return; }
      }
    }
  }

  // Texto livre (modo IA, ou texto que não é uma opção do menu)
  if (await answerFree(state, conv, text)) { state.aiTurns = (state.aiTurns ?? 0) + 1; return; }

  if (state.mode === "ai" && aiOn) {
    // a IA está configurada mas não respondeu agora (limite de uso, instabilidade): avisa com naturalidade em vez de dizer que não entendeu
    await botSay(state, pickOne(["Ops, deu uma travadinha aqui do meu lado. 😅 Pode mandar de novo em instantes? Se preferir, é só dizer que chamo alguém da equipe.", "Desculpa, fiquei um pouquinho lenta agora. Me manda sua mensagem de novo? Ou, se for urgente, chamo alguém da equipe pra te atender. 🙏"]), conv.id);
    return;
  }
  if (state.mode === "ai") {
    await botSay(state, pickOne(["Hmm, não peguei direito o que você quis dizer. Pode me explicar de outro jeito? Se preferir, chamo alguém da equipe. 🙏", "Desculpa, não entendi bem. Me conta de novo com outras palavras? Ou, se quiser, eu chamo alguém da equipe pra te ajudar.", "Acho que não captei direito. Pode repetir de outro jeito? Se for mais fácil, é só dizer que chamo a equipe. 😊"]), conv.id);
    return;
  }
  await botSay(state, pickOne(["Não entendi essa opção. 😅 Escolha uma das opções abaixo:", "Hmm, não achei essa opção. Veja se alguma das de baixo ajuda:", "Não consegui entender. Escolhe uma das opções abaixo pra eu te ajudar? 😊"]), conv.id);
  await sendStart(state, conv);
}

// Encerra sozinho as conversas só com o bot que ficaram paradas
export function startConversationSweeper() {
  const run = async () => {
    try {
      const cfg = await prisma.wppBotConfig.findFirst();
      if (cfg && cfg.idleCloseMin > 0) await closeIdleActive(cfg.idleCloseMin, cfg.idleCloseMsg);
      const stale = await prisma.wppConversation.findMany({ where: { status: "bot", updatedAt: { lt: new Date(Date.now() - returnMs(cfg)) } } });
      for (const c of stale) {
        await prisma.wppConversation.update({ where: { id: c.id }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
        clientStates.delete(stateKey(targetOf(c)));
      }
    } catch (e) { console.error("[wa] limpeza de conversas:", e); }
  };
  setInterval(run, 60 * 1000).unref?.();
}
