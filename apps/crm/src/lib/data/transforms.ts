import type {
  Customer,
  SalesPipeline,
  Contract,
  LearningRecord,
  AgentRecord,
  CustomerWithRelations,
} from "@strategy-school/shared-db";

// Supabase の結合クエリ結果（配列）を UI が期待するネスト構造に変換

interface SupabaseCustomerRow extends Customer {
  sales_pipeline: SalesPipeline[];
  contracts: Contract[];
  learning_records: LearningRecord[];
  agent_records: AgentRecord[];
}

export function transformCustomerRow(
  row: SupabaseCustomerRow
): CustomerWithRelations {
  const { sales_pipeline, contracts, learning_records, agent_records, ...customer } = row;

  return {
    ...customer,
    pipeline: sales_pipeline?.[0] ?? undefined,
    contract: contracts?.[0] ?? undefined,
    learning: learning_records?.[0] ?? undefined,
    agent: agent_records?.[0] ?? undefined,
  };
}

export function transformCustomerRows(
  rows: SupabaseCustomerRow[]
): CustomerWithRelations[] {
  return rows.map(transformCustomerRow);
}
