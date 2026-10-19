// Mantém o registro de serviços em dia com os pedidos: entregue → vira registro; reaberto → o registro some.
import { prisma } from "../db.js";

export async function syncOrderServiceRecords(orderId: string, prevStatus: string, newStatus: string, userName?: string | null) {
  try {
    if (newStatus === "entregue" && prevStatus !== "entregue") {
      if (await prisma.serviceRecord.count({ where: { orderId } })) return;
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
      if (!order || !order.items.length) return;
      const orderTotal = Number(order.total), orderPaid = Math.min(Number(order.paid), orderTotal);
      await prisma.serviceRecord.createMany({
        data: order.items.map((i) => ({
          date: order.deliveredAt ?? new Date(), customerId: order.customerId, customerName: order.customer.name, description: i.description,
          quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, cost: 0, source: "pedido",
          // recebido do pedido dividido entre os itens, na proporção do valor de cada um
          amountPaid: orderTotal > 0 ? Math.round(orderPaid * (Number(i.total) / orderTotal) * 100) / 100 : 0,
          paid: orderTotal > 0 && orderPaid >= orderTotal, orderId, createdBy: userName ?? null,
          notes: `Pedido #${order.number}`,
        })),
      });
    } else if (prevStatus === "entregue" && newStatus !== "entregue") {
      await prisma.serviceRecord.deleteMany({ where: { orderId, source: "pedido" } });
    }
  } catch (e) {
    console.error("[servicos] não consegui sincronizar o registro do pedido:", e);
  }
}
