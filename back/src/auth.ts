import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

const SECRET = () => process.env.JWT_SECRET || "pixel-grafica-dev";

export interface AuthUser { id: string; name: string; email: string; role: string }
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const signToken = (u: AuthUser) => jwt.sign(u, SECRET(), { expiresIn: "12h" });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  // ?token= permite abrir/baixar arquivos em nova aba
  const token = header.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  if (!token) return res.status(401).json({ error: "Faça login para continuar." });
  try {
    const p = jwt.verify(token, SECRET()) as AuthUser;
    const u = await prisma.user.findUnique({ where: { id: p.id } });
    if (!u || !u.active) return res.status(401).json({ error: "Acesso desativado." });
    req.user = { id: u.id, name: u.name, email: u.email, role: u.role };
    next();
  } catch {
    res.status(401).json({ error: "Sessão expirada. Entre novamente." });
  }
}

export const requireRole = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) =>
  req.user && (req.user.role === "admin" || roles.includes(req.user.role))
    ? next()
    : res.status(403).json({ error: "Sem permissão para esta ação." });
