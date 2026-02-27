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
          className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-sm">
              {customer.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-sm">{customer.name}</p>
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
