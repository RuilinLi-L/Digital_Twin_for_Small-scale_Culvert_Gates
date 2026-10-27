import { randomUUID } from "node:crypto";
import type { RepairRecord } from "@/lib/components";
import { getDatabasePool } from "./database";

export type NewRepairRecord = Omit<RepairRecord, "id" | "createdAt">;

const recordColumns = `
  id::text AS "id",
  component_id AS "componentId",
  to_char(inspected_at, 'YYYY-MM-DD') AS "inspectedAt",
  inspector,
  issue,
  action,
  status,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
`;

export async function listRecords(componentId: string | null): Promise<RepairRecord[]> {
  const pool = getDatabasePool();
  const result = componentId
    ? await pool.query<RepairRecord>(
      `SELECT ${recordColumns} FROM public.hanzha_repair_records
       WHERE component_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`,
      [componentId],
    )
    : await pool.query<RepairRecord>(
      `SELECT ${recordColumns} FROM public.hanzha_repair_records
       ORDER BY created_at DESC, id DESC LIMIT 100`,
    );
  return result.rows;
}

export async function createRecord(input: NewRepairRecord): Promise<RepairRecord> {
  const result = await getDatabasePool().query<RepairRecord>(
    `INSERT INTO public.hanzha_repair_records
     (id, component_id, inspected_at, inspector, issue, action, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${recordColumns}`,
    [randomUUID(), input.componentId, input.inspectedAt, input.inspector, input.issue, input.action, input.status],
  );
  return result.rows[0];
}
