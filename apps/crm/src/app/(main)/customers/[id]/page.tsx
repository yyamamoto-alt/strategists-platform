export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { fetchCustomerById } from "@/lib/data/customers";
import { fetchCustomerEmails, fetchApplicationHistory } from "@/lib/data/spreadsheet-sync";
import { fetchOrdersByCustomer } from "@/lib/data/orders";
import { fetchMentorsByCustomerId } from "@/lib/data/mentors";
import { fetchCustomerAttribution } from "@/lib/data/marketing-settings";
import { CustomerDetailClient } from "./customer-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  const [result, emails, applicationHistory, orders, mentors, attribution] = await Promise.all([
    fetchCustomerById(id),
    fetchCustomerEmails(id),
    fetchApplicationHistory(id),
    fetchOrdersByCustomer(id),
    fetchMentorsByCustomerId(id),
    fetchCustomerAttribution(id),
  ]);
  if (!result) return notFound();

  return (
    <CustomerDetailClient
      customer={result.customer}
      activities={result.activities}
      emails={emails}
      applicationHistory={applicationHistory}
      orders={orders}
      mentors={mentors}
      attribution={attribution as import("./customer-detail-client").ChannelAttributionData | null}
    />
  );
}
