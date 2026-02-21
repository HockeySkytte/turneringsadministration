import { getAppContext } from "@/lib/appContext";
import StatistikOverviewTaServer from "./StatistikOverviewTaServer";

export const dynamic = "force-dynamic";

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { statsAggregationMode } = await getAppContext();
  return <StatistikOverviewTaServer searchParams={searchParams} mode={statsAggregationMode} />;
}
