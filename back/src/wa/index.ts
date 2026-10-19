// Fachada do WhatsApp. O resto do sistema usa SÓ este módulo.
//  • Com WA_WORKER_URL (produção): o WhatsApp roda num processo próprio (whatsapp-worker.ts) e a API fala com
//    ele por HTTP local, então reiniciar a API NÃO derruba a conexão.
//  • Sem WA_WORKER_URL (desenvolvimento): tudo roda no mesmo processo, com `npm run dev`.
import * as tr from "./transport.js";
import * as conv from "./conversations.js";
import { initBot, startConversationSweeper } from "./brain.js";
import { resetAiConfigCache } from "./ai.js";

export type { SessionInfo, WppStatus, ChoiceOption } from "./transport.js";

const isLocal = () => process.env.WA_ROLE === "worker" || !process.env.WA_WORKER_URL;
const baseUrl = () => (process.env.WA_WORKER_URL || "").replace(/\/$/, "");
const headers = () => ({ "content-type": "application/json", "x-wa-token": process.env.WA_INTERNAL_TOKEN || "" });

async function rpc<T>(fn: string, args: unknown[], fallback: T): Promise<T> {
  try {
    const res = await fetch(`${baseUrl()}/rpc`, { method: "POST", headers: headers(), body: JSON.stringify({ fn, args }), signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  } catch (e: any) {
    console.error(`[wa] worker do WhatsApp indisponível (${fn}): ${e.message}`);
    return fallback;
  }
}

// Estado da conexão: no modo proxy é consultado ao worker a cada 3s
const OFFLINE: tr.SessionInfo = { status: "disconnected", phone: null, qrDataUrl: null };
let cached: tr.SessionInfo = OFFLINE;
let polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  const tick = async () => {
    try {
      const res = await fetch(`${baseUrl()}/status`, { headers: headers(), signal: AbortSignal.timeout(4000) });
      cached = res.ok ? ((await res.json()) as tr.SessionInfo) : OFFLINE;
    } catch { cached = OFFLINE; }
  };
  void tick();
  setInterval(tick, 3000).unref?.();
}

export function getSessionInfo(): tr.SessionInfo {
  if (isLocal()) return tr.getSessionInfo();
  startPolling();
  return cached;
}

// Quem mantém o socket liga o bot e retoma a sessão salva
export async function startLocalWhatsApp() {
  initBot();
  startConversationSweeper();
  setTimeout(() => { void tr.resumeSession(); }, 1500);
}
export const isWhatsAppLocal = isLocal;

const NO_WORKER = { ok: false as const, error: "O serviço do WhatsApp não respondeu. Tente de novo." };

export const sendMessage = (target: string, text: string): Promise<boolean> =>
  isLocal() ? tr.sendText(target, text) : rpc("sendMessage", [target, text], false);

export const sendFile = (target: string, file: Buffer, fileName: string, mime: string, caption?: string): Promise<boolean> =>
  isLocal() ? tr.sendFile(target, file, fileName, mime, caption) : rpc("sendFile", [target, { __buffer: file.toString("base64") }, fileName, mime, caption], false);

export const startConversation = (...a: Parameters<typeof conv.startConversation>) =>
  isLocal() ? conv.startConversation(...a) : rpc<Awaited<ReturnType<typeof conv.startConversation>>>("startConversation", a, NO_WORKER);

export const acceptWaitingConversation = (...a: Parameters<typeof conv.acceptWaitingConversation>) =>
  isLocal() ? conv.acceptWaitingConversation(...a) : rpc<Awaited<ReturnType<typeof conv.acceptWaitingConversation>>>("acceptWaitingConversation", a, null);

export const closeActiveConversation = (...a: Parameters<typeof conv.closeActiveConversation>) =>
  isLocal() ? conv.closeActiveConversation(...a) : rpc<Awaited<ReturnType<typeof conv.closeActiveConversation>>>("closeActiveConversation", a, null);

export const transferConversation = (...a: Parameters<typeof conv.transferConversation>) =>
  isLocal() ? conv.transferConversation(...a) : rpc<Awaited<ReturnType<typeof conv.transferConversation>>>("transferConversation", a, null);

export const transferToPerson = (...a: Parameters<typeof conv.transferToPerson>) =>
  isLocal() ? conv.transferToPerson(...a) : rpc<Awaited<ReturnType<typeof conv.transferToPerson>>>("transferToPerson", a, { ok: false, error: "O serviço do WhatsApp não respondeu. Tente de novo." });

export const offerConversation = (...a: Parameters<typeof conv.offerConversation>): Promise<void> =>
  isLocal() ? conv.offerConversation(...a) : rpc<void>("offerConversation", a, undefined);

export const connectSession = async (): Promise<void> => { if (isLocal()) await tr.connectSession(); else await rpc<void>("connectSession", [], undefined); };
export const disconnectSession = async (): Promise<void> => { if (isLocal()) await tr.disconnectSession(); else await rpc<void>("disconnectSession", [], undefined); };

// Configuração do bot/IA mudou no painel: o processo do WhatsApp deve reler
export const reloadBotConfig = async (): Promise<void> => { resetAiConfigCache(); if (!isLocal()) await rpc<void>("reloadBotConfig", [], undefined); };

// Funções que o worker expõe para a API (lista fechada)
export const workerFunctions: Record<string, (...args: any[]) => any> = {
  sendMessage: tr.sendText, sendFile: tr.sendFile, startConversation: conv.startConversation,
  acceptWaitingConversation: conv.acceptWaitingConversation, closeActiveConversation: conv.closeActiveConversation,
  transferConversation: conv.transferConversation, transferToPerson: conv.transferToPerson, offerConversation: conv.offerConversation,
  connectSession: () => tr.connectSession(), disconnectSession: tr.disconnectSession,
  reloadBotConfig: () => resetAiConfigCache(),
};
