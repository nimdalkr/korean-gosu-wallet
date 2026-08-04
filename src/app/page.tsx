import { logout } from "./actions";
import { Dashboard } from "@/components/dashboard";
import { getDashboardSnapshot } from "@/lib/data";
import { requireSession, requireUpstreamAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUpstreamAccess();
  await requireSession();
  const snapshot = await getDashboardSnapshot();
  return <Dashboard data={snapshot} logoutAction={logout} />;
}
