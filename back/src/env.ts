// Carrega o .env da raiz do projeto (um só arquivo para API, worker do WhatsApp e Prisma).
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

export const UPLOAD_DIR = path.resolve(here, "../uploads");
export const SESSIONS_DIR = path.resolve(here, "../wpp-sessions");
export const FRONT_DIST = path.resolve(here, "../../front/dist");
