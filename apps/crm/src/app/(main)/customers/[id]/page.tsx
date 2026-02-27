import { notFound } from "next/navigation";
import { fetchCustomerById } from "@/lib/data/customers";
import { CustomerDetailClient } from "./customer-detail-client";
import { mockCustomers, mockActivities } from "@/lib/mock-data";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const customer = mockCustomers.find((c) => c.id === id);
    if (!customer) return notFound();

    const activities = mockActivities
      .filter((a) => a.customer_id === customer.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return (
      <CustomerDetailClient customer={customer} activities={activities} />
    );
  }

  const result = await fetchCustomerById(id);
  if (!result) return notFound();

  return (
    <CustomerDetailClient
      customer={result.customer}
      activities={result.activities}
    />
  );
}
