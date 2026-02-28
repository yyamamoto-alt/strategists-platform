import type {
  Customer,
  SalesPipeline,
  Contract,
  LearningRecord,
  AgentRecord,
  CustomerWithRelations,
} from "@strategy-school/shared-db";

// Supabase の結合クエリ結果を UI が期待するネスト構造に変換
// NOTE: Supabase はユニーク制約のある FK はオブジェクト、ない FK は配列で返す
//       sales_pipeline.customer_id はユニーク → オブジェクトで返る

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SupabaseCustomerRow extends Customer {
  sales_pipeline: SalesPipeline | SalesPipeline[] | null;
  contracts: Contract | Contract[] | null;
  learning_records: LearningRecord | LearningRecord[] | null;
  agent_records: AgentRecord | AgentRecord[] | null;
}

/** 配列 or オブジェクト or null → 最初の1件を取得 */
function firstOrSelf<T>(val: T | T[] | null | undefined): T | undefined {
  if (val == null) return undefined;
  if (Array.isArray(val)) return val[0];
  return val as T;
}

export function transformCustomerRow(
  row: SupabaseCustomerRow
): CustomerWithRelations {
  const { sales_pipeline, contracts, learning_records, agent_records, ...customer } = row;

  return {
    ...customer,
    pipeline: firstOrSelf(sales_pipeline),
    contract: firstOrSelf(contracts),
    learning: firstOrSelf(learning_records),
    agent: firstOrSelf(agent_records),
  };
}

export function transformCustomerRows(
  rows: SupabaseCustomerRow[]
): CustomerWithRelations[] {
  return rows.map(transformCustomerRow);
}
