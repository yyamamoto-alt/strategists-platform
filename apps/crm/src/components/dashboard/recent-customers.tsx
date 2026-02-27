"use client";

import Link from "next/link";
import { formatDate, getStageColor, getAttributeColor } from "@/lib/utils";
import { Customer, SalesPipeline } from "@/types/database";

interface RecentCustomersProps {
  customers: (Customer & { pipeline?: SalesPipeline })[];
}

export function RecentCustomers({ customers }: RecentCustomersProps) {
  return (
    <div className="space-y-3">
      {customers.map((customer) => (
        <Link
          key={customer.id}
          href={`/customers/${customer.id}`}
          className="flex items-center justify-between p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-sm">
              {customer.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-sm text-white">{customer.name}</p>
              <p className="text-xs text-gray-500">
                {formatDate(customer.application_date)} 申込
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(
                customer.attribute
              )}`}
            >
              {customer.attribute}
            </span>
            {customer.pipeline && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(
                  customer.pipeline.stage
                )}`}
              >
                {customer.pipeline.stage}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
