// Transporte do WhatsApp (Baileys): conexão, QR, envio de texto, botões e arquivos.
// Não conhece regras do negócio; as mensagens recebidas vão para o handler registrado (brain.ts).
import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  isJidGroup,
  isJidBroadcast,
  proto,
  generateWAMessageFromContent,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import path from "path";
import fs from "fs";
import { SESSIONS_DIR } from "../env.js";
import { prisma } from "../db.js";
import { cut } from "../lib/text.js";

export type WppStatus = "not_configured" | "disconnected" | "qr_pending" | "connecting" | "connected";
export interface SessionInfo { status: WppStatus; phone: string | null; qrDataUrl: string | null }
export interface ChoiceOption { id: string; text: string; description?: string }
export type IncomingHandler = (msg: any, sock: any) => Promise<void>;

interface ActiveSession { sock: any; status: WppStatus; phone: string | null; qrDataUrl: string | null }

let session: ActiveSession | null = null;
let incomingHandler: IncomingHandler | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let generation = 0;

export const setIncomingHandler = (fn: IncomingHandler) => { incomingHandler = fn; };

// ── Endereços ────────────────────────────────────────────────────────────────
export const jidToPhone = (jid: string) => jid.replace(/@.*/, "").replace(/:[0-9]+$/, "");
export const phoneToJid = (phone: string) => {
  const d = String(phone).replace(/\D/g, "");
  // "55" no começo só é o DDI do Brasil se o número tem 12+ dígitos (DDD 55, no RS, tem 10 ou 11 dígitos sem DDI)
  return `${d.startsWith("55") && d.length >= 12 ? d : `55${d}`}@s.whatsapp.net`;
};
export const toJid = (v: string) => (v.includes("@") ? v : phoneToJid(v));

const makeLogger = (): any => {
  const noop = () => {};
  const l: any = { level: "silent", trace: noop, debug: noop, info: noop, warn: noop, error: noop };
  l.child = () => makeLogger();
  return l;
};

async function qrToDataUrl(q: string): Promise<string | null> {
  try { const QR = await import("qrcode"); return await QR.default.toDataURL(q, { width: 300, margin: 2 }); }
  catch { return null; }
}

async function updateDb(status: WppStatus, phone: string | null, qrCode: string | null) {
  try {
    const inst = (await prisma.wppInstance.findFirst()) ?? (await prisma.wppInstance.create({ data: { status } }));
    await prisma.wppInstance.update({
      where: { id: inst.id },
      data: { status, phone, isActive: status === "connected", qrCode: status === "connected" ? null : qrCode },
    });
  } catch { /* o estado em memória é a fonte da verdade */ }
}

export function getSessionInfo(): SessionInfo {
  if (!session) return { status: "not_configured", phone: null, qrDataUrl: null };
  return { status: session.status, phone: session.phone, qrDataUrl: session.status === "qr_pending" ? session.qrDataUrl : null };
}

const connected = () => !!session && session.status === "connected";

// ── Envio ────────────────────────────────────────────────────────────────────
// "digitando…" proporcional ao texto, para a conversa parecer natural
export async function typing(target: string, text: string) {
  if (!connected()) return;
  const jid = toJid(target);
  try {
    await session!.sock.sendPresenceUpdate("composing", jid);
    await new Promise((r) => setTimeout(r, Math.min(300 + text.length * 12, 1800)));
    await session!.sock.sendPresenceUpdate("paused", jid);
  } catch { /* presença é opcional */ }
}

export async function sendText(target: string, text: string): Promise<boolean> {
  if (!connected()) return false;
  try { await session!.sock.sendMessage(toJid(target), { text }); return true; }
  catch (e) { console.error("[wa] erro ao enviar texto:", e); return false; }
}

export async function sendFile(target: string, file: Buffer, fileName: string, mime: string, caption?: string): Promise<boolean> {
  if (!connected()) return false;
  const jid = toJid(target);
  try {
    if (mime.startsWith("image/")) await session!.sock.sendMessage(jid, { image: file, caption, mimetype: mime });
    else if (mime.startsWith("video/")) await session!.sock.sendMessage(jid, { video: file, caption, mimetype: mime });
    else if (mime.startsWith("audio/")) {
      // áudio de verdade (nota de voz quando é ogg/opus, como o WhatsApp grava); áudio não tem legenda, então ela vai em texto
      await session!.sock.sendMessage(jid, { audio: file, mimetype: /ogg|opus/i.test(mime) ? "audio/ogg; codecs=opus" : mime, ptt: /ogg|opus/i.test(mime) });
      if (caption) await session!.sock.sendMessage(jid, { text: caption });
    }
    else await session!.sock.sendMessage(jid, { document: file, mimetype: mime || "application/octet-stream", fileName, caption });
    return true;
  } catch (e) { console.error("[wa] erro ao enviar arquivo:", e); return false; }
}

const numberedMenu = (body: string, options: ChoiceOption[], hint?: string) =>
  `${body}\n\n${options.map((o) => `*${o.id}* - ${o.text}`).join("\n")}${hint ? `\n\n_${hint}_` : ""}`;

// Pergunta com opções clicáveis: até 3 = botões de resposta rápida; mais que isso = lista.
// Se os botões estiverem desligados ou falharem, cai para o menu numerado em texto.
export async function sendChoice(target: string, body: string, options: ChoiceOption[], opts: { footer?: string; hint?: string } = {}): Promise<boolean> {
  if (!connected()) return false;
  const jid = toJid(target);
  const hint = opts.hint ?? "Toque em uma opção ou digite o número.";
  await typing(jid, body);

  const useButtons = (await prisma.wppBotConfig.findFirst().catch(() => null))?.useButtons !== false;
  if (useButtons && options.length) {
    try {
      const buttons = options.length <= 3
        ? options.map((o) => ({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: cut(o.text, 20), id: o.id }) }))
        : [{
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Ver opções",
              sections: [{ title: "Opções", rows: options.map((o) => ({ id: o.id, title: cut(o.text, 24), description: o.description ? cut(o.description, 72) : "" })) }],
            }),
          }];
      const interactiveMessage = proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer ?? "Pixel Gráfica" }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons }),
      });
      const message = generateWAMessageFromContent(jid, proto.Message.fromObject({ interactiveMessage }), { userJid: session!.sock.user?.id });
      const additionalNodes = [
        { tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] },
        { tag: "bot", attrs: { biz_bot: "1" } },
      ];
      await session!.sock.relayMessage(jid, message.message, { messageId: message.key.id, additionalNodes });
      return true;
    } catch (e) {
      console.error("[wa] falha ao enviar botões, usando texto:", e);
    }
  }
  return sendText(jid, numberedMenu(body, options, hint));
}

// ── Recebimento ──────────────────────────────────────────────────────────────
// Texto de uma mensagem recebida, inclusive o clique em botão/lista (devolve o id da opção)
export function extractIncomingText(message: any): string {
  const m = message?.ephemeralMessage?.message ?? message?.viewOnceMessage?.message ?? message ?? {};
  const params = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  let interactiveId = "";
  if (params) { try { interactiveId = String(JSON.parse(params)?.id ?? "").trim(); } catch { /* ignora */ } }
  return (
    m.conversation || m.extendedTextMessage?.text || interactiveId ||
    m.buttonsResponseMessage?.selectedButtonId || m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || ""
  );
}

export interface IncomingMedia { kind: "image" | "document" | "video" | "audio"; mime: string; fileName: string; buffer: Buffer }

// Baixa imagem/documento/vídeo/áudio enviado pelo cliente (artes, logos, PDFs…)
export async function downloadIncomingMedia(msg: any): Promise<IncomingMedia | null> {
  const m = msg.message?.ephemeralMessage?.message ?? msg.message?.viewOnceMessage?.message ?? msg.message ?? {};
  const pick = m.documentMessage ? ["document", m.documentMessage]
    : m.imageMessage ? ["image", m.imageMessage]
    : m.videoMessage ? ["video", m.videoMessage]
    : m.audioMessage ? ["audio", m.audioMessage] : null;
  if (!pick || !session) return null;
  const [kind, part] = pick as [IncomingMedia["kind"], any];
  try {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, { logger: makeLogger(), reuploadRequest: session.sock.updateMediaMessage })) as Buffer;
    const mime: string = part.mimetype || "application/octet-stream";
    const ext = (mime.split("/")[1] || "bin").split(";")[0];
    return { kind, mime, buffer, fileName: part.fileName || `${kind}-${Date.now()}.${ext}` };
  } catch (e) {
    console.error("[wa] não consegui baixar a mídia:", e);
    return null;
  }
}

export const isIgnorableJid = (jid: string) => isJidGroup(jid) || isJidBroadcast(jid) || jid === "status@broadcast";

// Descobre o telefone real: o WhatsApp pode entregar um ID interno (@lid) no lugar do número
export async function resolvePhone(msg: any): Promise<string> {
  const jid: string = msg.key.remoteJid;
  const alt: string | undefined = msg.key.remoteJidAlt || msg.key.participantAlt;
  if (jid.endsWith("@s.whatsapp.net")) return jidToPhone(jid);
  if (alt?.endsWith("@s.whatsapp.net")) return jidToPhone(alt);
  try {
    const pn = await session?.sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (pn) return jidToPhone(pn);
  } catch { /* usa o id */ }
  return jidToPhone(jid);
}

// ── Conexão ──────────────────────────────────────────────────────────────────
function closeSocket(sock: any) {
  try {
    sock.ev.removeAllListeners("connection.update");
    sock.ev.removeAllListeners("messages.upsert");
    sock.ev.removeAllListeners("creds.update");
    sock.end(undefined);
  } catch { /* já fechado */ }
}

export async function connectSession(attempt = 0) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const gen = ++generation;
  if (session?.sock) closeSocket(session.sock);

  const dir = path.join(SESSIONS_DIR, "default");
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  if (gen !== generation) return;

  const make = (makeWASocket as any).default || makeWASocket;
  const sock = make({ ...(version ? { version } : {}), logger: makeLogger(), auth: state, syncFullHistory: false });

  if (!session) session = { sock, status: "connecting", phone: null, qrDataUrl: null };
  else Object.assign(session, { sock, status: "connecting", qrDataUrl: null });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: any) => {
    if (gen !== generation) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session!.status = "qr_pending";
      session!.qrDataUrl = await qrToDataUrl(qr);
      await updateDb("qr_pending", null, session!.qrDataUrl);
    }
    if (connection === "connecting" && session!.status !== "qr_pending") session!.status = "connecting";

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.warn("[wa] sessão encerrada pelo celular; apagando sessão local");
        fs.rmSync(dir, { recursive: true, force: true });
        Object.assign(session!, { status: "disconnected", qrDataUrl: null, phone: null });
        await updateDb("disconnected", null, null);
      } else if (code === DisconnectReason.restartRequired) {
        void connectSession(0); // o WhatsApp pede reinício logo após ler o QR
      } else if (code === DisconnectReason.connectionReplaced) {
        console.warn("[wa] conexão substituída por outra sessão; não vou reconectar sozinho");
        Object.assign(session!, { status: "disconnected", qrDataUrl: null });
        await updateDb("disconnected", session!.phone, null);
      } else {
        const delay = Math.min(2000 * (attempt + 1), 30_000);
        console.warn(`[wa] conexão caiu (código ${code ?? "?"}); reconectando em ${delay / 1000}s`);
        session!.status = "connecting";
        reconnectTimer = setTimeout(() => { void connectSession(attempt + 1); }, delay);
      }
    }

    if (connection === "open") {
      attempt = 0;
      const phone = jidToPhone(sock.user?.id || "");
      Object.assign(session!, { status: "connected", phone, qrDataUrl: null });
      await updateDb("connected", phone, null);
      console.log(`[wa] WhatsApp conectado: ${phone}`);
    }
  });

  sock.ev.on("messages.upsert", async (m: any) => {
    if (gen !== generation || m.type !== "notify" || !incomingHandler) return;
    for (const msg of m.messages) {
      try { await incomingHandler(msg, sock); } catch (e) { console.error("[wa] erro ao tratar mensagem:", e); }
    }
  });
}

// Ao subir, volta sozinho com a sessão salva (sem QR)
export async function resumeSession() {
  try {
    const credsFile = path.join(SESSIONS_DIR, "default", "creds.json");
    if (!fs.existsSync(credsFile)) return;
    const creds = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
    if (!creds?.me) return;
    console.log("[wa] retomando a sessão salva");
    await connectSession();
  } catch (e) { console.error("[wa] não consegui retomar a sessão:", e); }
}

export async function disconnectSession() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  generation++; // ignora eventos do socket que vai fechar
  if (session?.sock) {
    try { await session.sock.logout(); } catch { /* já desconectado */ }
    closeSocket(session.sock);
  }
  fs.rmSync(path.join(SESSIONS_DIR, "default"), { recursive: true, force: true });
  if (session) Object.assign(session, { status: "disconnected", phone: null, qrDataUrl: null });
  await updateDb("disconnected", null, null);
}
