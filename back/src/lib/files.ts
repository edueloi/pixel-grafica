// Armazenamento de arquivos + extração de texto (a IA lê o que for extraído aqui).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { UPLOAD_DIR } from "../env.js";
import { prisma } from "../db.js";

const require = createRequire(import.meta.url);
const MAX_TEXT = 200_000; // limite de texto guardado por arquivo

export const filePath = (storedName: string) => path.join(UPLOAD_DIR, storedName);

export function storeBuffer(buffer: Buffer, originalName: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(originalName).slice(0, 12).replace(/[^.\w]/g, "");
  const storedName = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(filePath(storedName), buffer);
  return storedName;
}

// Nomes vindos do navegador/WhatsApp chegam em latin1 quando têm acento
export function fixName(name: string): string {
  try { const fixed = Buffer.from(name, "latin1").toString("utf8"); return fixed.includes("�") ? name : fixed; }
  catch { return name; }
}

export async function extractText(buffer: Buffer, mime: string, name: string): Promise<string | null> {
  const ext = path.extname(name).toLowerCase();
  try {
    if (mime === "application/pdf" || ext === ".pdf") {
      const pdf = require("pdf-parse/lib/pdf-parse.js");
      return clean((await pdf(buffer)).text);
    }
    if (ext === ".docx" || mime.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      return clean((await mammoth.extractRawText({ buffer })).value);
    }
    if ([".xlsx", ".xls", ".ods"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      return clean(wb.SheetNames.map((n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n"));
    }
    if ([".txt", ".csv", ".md", ".json", ".tsv"].includes(ext) || mime.startsWith("text/")) {
      return clean(buffer.toString("utf8"));
    }
  } catch (e) {
    console.error(`[files] não consegui ler "${name}":`, (e as Error).message);
  }
  return null; // imagens, artes (AI/PSD/CDR) e outros: guardados, mas sem texto
}

const clean = (t: string) => {
  const out = t.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return out ? out.slice(0, MAX_TEXT) : null;
};

// Grava o arquivo, cria o registro e lê o texto
export async function saveAttachment(input: {
  buffer: Buffer; name: string; mime: string; kind: string; uploadedBy?: string | null; aiEnabled?: boolean;
  orderId?: string | null; quoteId?: string | null; customerId?: string | null; conversationId?: string | null;
}) {
  const name = fixName(input.name);
  const storedName = storeBuffer(input.buffer, name);
  const extractedText = await extractText(input.buffer, input.mime, name);
  return prisma.attachment.create({
    data: {
      name, storedName, mime: input.mime || "application/octet-stream", size: input.buffer.length, kind: input.kind,
      extractedText, aiEnabled: input.aiEnabled ?? true, uploadedBy: input.uploadedBy ?? null,
      orderId: input.orderId ?? null, quoteId: input.quoteId ?? null, customerId: input.customerId ?? null, conversationId: input.conversationId ?? null,
    },
  });
}
