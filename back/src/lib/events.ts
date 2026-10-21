// Atualização em tempo real (Server-Sent Events): o painel abre UMA conexão e recarrega o que está na tela quando algo muda.
// Mudanças feitas pela API disparam sozinhas (ver server.ts); o worker do WhatsApp avisa a API por HTTP local.
import type { Request, Response } from "express";

const clients = new Set<Response>();
let timer: NodeJS.Timeout | null = null;

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 3000\n\n");
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); clients.delete(res); });
}

/** Avisa todos os painéis abertos (junta rajadas de mudanças em um único aviso). */
export function broadcastChange() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const c of clients) c.write("event: change\ndata: {}\n\n");
  }, 250);
}

/** Chamado por quem muda dados fora da API (worker do WhatsApp): avisa a API, que repassa aos painéis. */
export function notifyChange() {
  if (process.env.WA_ROLE === "worker") {
    const port = Number(process.env.PORT) || 3100;
    fetch(`http://127.0.0.1:${port}/api/internal/notify`, { method: "POST", headers: { "x-wa-token": process.env.WA_INTERNAL_TOKEN || "" }, signal: AbortSignal.timeout(3000) }).catch(() => {});
  } else broadcastChange();
}
