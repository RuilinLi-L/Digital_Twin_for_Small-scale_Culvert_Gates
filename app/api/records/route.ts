import { z } from "zod";
import { componentIds } from "@/lib/components";
import { createRecord, listRecords } from "@/lib/server/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

const recordSchema = z.object({
  componentId: z.string().refine((value) => componentIds.has(value), "请选择有效构件"),
  inspectedAt: z.string().refine(isCalendarDate, "请选择有效检查日期"),
  inspector: z.string().trim().min(1, "请填写巡检人员").max(40),
  issue: z.string().trim().min(2, "请填写检查情况").max(600),
  action: z.string().trim().min(2, "请填写处理措施").max(600),
  status: z.enum(["正常", "待处理", "已处理"]),
});

export async function GET(request: Request) {
  const componentId = new URL(request.url).searchParams.get("componentId");
  if (componentId && !componentIds.has(componentId)) {
    return Response.json({ error: "构件编号无效" }, { status: 400 });
  }
  try {
    const records = await listRecords(componentId);
    return Response.json({ records });
  } catch {
    return Response.json({ error: "记录暂时无法加载，请联系管理员检查数据库配置" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); }
  catch { return Response.json({ error: "请求内容不是有效 JSON" }, { status: 400 }); }
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "请检查填写内容" }, { status: 400 });
  }
  try {
    const record = await createRecord(parsed.data);
    return Response.json({ record }, { status: 201 });
  } catch {
    return Response.json({ error: "记录暂时无法保存，请稍后重试" }, { status: 503 });
  }
}
