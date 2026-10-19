import type { Request, Response, NextFunction, RequestHandler } from "express";

// Express 4 não captura erro de função async: este wrapper manda para o handler de erros
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const str = (v: unknown, max = 255) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
export const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const date = (v: unknown) => { if (!v) return null; const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v)); return isNaN(d.getTime()) ? null : d; };
