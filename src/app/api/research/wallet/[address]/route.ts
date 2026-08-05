import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/data";
import { hasValidSession, requireUpstreamAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> },
) {
  await requireUpstreamAccess();
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { address: rawAddress } = await context.params;
  const address = rawAddress.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "올바른 Base 지갑 주소가 아닙니다." }, { status: 400 });
  }

  const snapshot = await getDashboardSnapshot();
  const profile = snapshot.research.walletProfiles.find(
    (item) => item.address === address,
  );
  if (!profile) {
    return NextResponse.json({ error: "추적 대상 지갑이 아닙니다." }, { status: 404 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
