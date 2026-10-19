import "./env.js";
import { Prisma, PrismaClient } from "@prisma/client";

// Valores em R$ (Decimal) saem como número no JSON da API
(Prisma.Decimal.prototype as any).toJSON = function () { return Number(this); };

export const prisma = new PrismaClient();
