import { fetchOrders, fetchReconciliationReport } from "@/lib/data/orders";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function OrdersPage() {
  const [orders, reconciliation] = await Promise.all([
    fetchOrders(),
    fetchReconciliationReport(),
  ]);

  return (
    <OrdersClient orders={orders} reconciliation={reconciliation} />
  );
}
