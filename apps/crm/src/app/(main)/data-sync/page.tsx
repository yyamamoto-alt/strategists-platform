import { fetchSpreadsheetConnections, fetchSyncLogs, fetchUnmatchedRecords } from "@/lib/data/spreadsheet-sync";
import { DataSyncClient } from "./data-sync-client";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function DataSyncPage() {
  const [connections, syncLogs, unmatchedRecords] = await Promise.all([
    fetchSpreadsheetConnections(),
    fetchSyncLogs(),
    fetchUnmatchedRecords(),
  ]);

  return (
    <DataSyncClient
      initialConnections={connections}
      initialSyncLogs={syncLogs}
      initialUnmatched={unmatchedRecords}
    />
  );
}
