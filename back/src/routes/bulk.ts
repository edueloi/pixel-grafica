// Ações em massa das listas: excluir (ou inativar quando há histórico) e ativar/inativar vários de uma vez.
import { Router } from "express";
import { prisma } from "../db.js";
import { ah, HttpError } from "./util.js";

export const router = Router();

const idsOf = (b: any): string[] => {
  const ids = Array.isArray(b?.ids) ? [...new Set<string>(b.ids.map(String))] : [];
  if (!ids.length) throw new HttpError(400, "Selecione ao menos um item.");
  if (ids.length > 500) throw new HttpError(400, "Selecione no máximo 500 itens por vez.");
  return ids;
};
const canEdit = (role: string) => role === "admin" || role === "atendente";

router.post("/bulk/:resource/delete", ah(async (req, res) => {
  const ids = idsOf(req.body), role = req.user!.role;
  const out = { deleted: 0, inactivated: 0, skipped: [] as { id: string; reason: string }[] };
  const each = async (fn: (id: string) => Promise<"deleted" | "inactivated" | string>) => {
    for (const id of ids) {
      try {
        const r = await fn(id);
        if (r === "deleted") out.deleted++; else if (r === "inactivated") out.inactivated++; else out.skipped.push({ id, reason: r });
      } catch { out.skipped.push({ id, reason: "não foi possível excluir" }); }
    }
  };

  switch (req.params.resource) {
    case "quotes":
      await each(async (id) => {
        if (await prisma.order.count({ where: { quoteId: id } })) return "já virou ordem de serviço";
        await prisma.quote.delete({ where: { id } }); return "deleted";
      });
      break;
    case "orders":
      if (role !== "admin") throw new HttpError(403, "Só o administrador exclui ordens de serviço. Prefira cancelar.");
      await each(async (id) => { await prisma.order.delete({ where: { id } }); return "deleted"; });
      break;
    case "customers":
      if (!canEdit(role)) throw new HttpError(403, "Sem permissão para esta ação.");
      await each(async (id) => {
        const used = (await prisma.order.count({ where: { customerId: id } })) + (await prisma.quote.count({ where: { customerId: id } }));
        if (used) { await prisma.customer.update({ where: { id }, data: { active: false } }); return "inactivated"; }
        await prisma.customer.delete({ where: { id } }); return "deleted";
      });
      break;
    case "products":
      if (!canEdit(role)) throw new HttpError(403, "Sem permissão para esta ação.");
      await each(async (id) => {
        const used = (await prisma.quoteItem.count({ where: { productId: id } })) + (await prisma.orderItem.count({ where: { productId: id } }));
        if (used) { await prisma.product.update({ where: { id }, data: { active: false } }); return "inactivated"; }
        await prisma.product.delete({ where: { id } }); return "deleted";
      });
      break;
    case "services":
      out.deleted = (await prisma.serviceRecord.deleteMany({ where: { id: { in: ids } } })).count;
      break;
    default: throw new HttpError(404, "Lista desconhecida.");
  }
  res.json(out);
}));

// Inativar tira da lista de escolha (orçamento, ordem de serviço) e a Pixel IA deixa de usar; ativar volta tudo.
router.post("/bulk/:resource/active", ah(async (req, res) => {
  const ids = idsOf(req.body), active = !!req.body?.active;
  if (!canEdit(req.user!.role)) throw new HttpError(403, "Sem permissão para esta ação.");
  let count = 0;
  if (req.params.resource === "customers") count = (await prisma.customer.updateMany({ where: { id: { in: ids } }, data: { active } })).count;
  else if (req.params.resource === "products") count = (await prisma.product.updateMany({ where: { id: { in: ids } }, data: { active } })).count;
  else throw new HttpError(404, "Esta lista não tem ativar/inativar.");
  res.json({ updated: count });
}));
