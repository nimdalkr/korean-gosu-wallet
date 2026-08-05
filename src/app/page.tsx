import { logout } from "./actions";
import { Dashboard } from "@/components/dashboard";
import type { DashboardData } from "@/components/dashboard";
import { getDashboardSnapshot } from "@/lib/data";
import { summarizeResearchDesk } from "@/lib/research-summary";
import { requireSession, requireUpstreamAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUpstreamAccess();
  await requireSession();
  const snapshot = await getDashboardSnapshot();
  const data: DashboardData = {
    generatedAt: snapshot.generatedAt,
    source: snapshot.source,
    coverage: snapshot.coverage,
    metrics: snapshot.metrics,
    wallets: snapshot.wallets,
    activities: snapshot.activities,
    signals: snapshot.signals,
    assetWatchlist: snapshot.assetWatchlist,
    research: summarizeResearchDesk(snapshot.research),
  };
  return <Dashboard data={data} logoutAction={logout} />;
}
