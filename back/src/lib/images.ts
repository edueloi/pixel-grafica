// Fotos do site: aceita JPG, PNG, WebP e GIF, corrige a rotação, limita o tamanho e gera miniatura (o site carrega rápido).
import sharp from "sharp";
import { storeBuffer } from "./files.js";

const MAGIC: [string, number[]][] = [["png", [0x89, 0x50, 0x4e, 0x47]], ["jpg", [0xff, 0xd8, 0xff]], ["gif", [0x47, 0x49, 0x46]], ["webp", [0x52, 0x49, 0x46, 0x46]]];
export const looksLikeImage = (b: Buffer) => MAGIC.some(([, sig]) => sig.every((v, i) => b[i] === v));

/** Grava a foto (até 1600 px) e a miniatura (até 520 px) em JPEG/WebP. Devolve os nomes dos arquivos. */
export async function saveSiteImage(buffer: Buffer, opts: { maxWidth?: number; maxHeight?: number; thumb?: boolean } = {}) {
  if (!looksLikeImage(buffer)) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  const base = sharp(buffer, { failOn: "none" }).rotate();
  const full = await base.clone().resize({ width: opts.maxWidth ?? 1600, height: opts.maxHeight, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const storedName = storeBuffer(full, "foto.webp");
  let thumbName = storedName;
  if (opts.thumb !== false) {
    const thumb = await base.clone().resize({ width: 520, height: 520, fit: "cover", position: "attention" }).webp({ quality: 76 }).toBuffer();
    thumbName = storeBuffer(thumb, "mini.webp");
  }
  return { storedName, thumbName };
}
