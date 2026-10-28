import { useQuery } from "@tanstack/react-query";
import { Coins, UserPlus, PlayCircle, GraduationCap } from "lucide-react";
import { api, coins, fdate } from "@/lib/api";
import { Glass, PageHeader, Stat, Loader, Empty } from "@/components/common";

export const ACTIONS = { friend_signup: ["Friend joined", UserPlus], friend_webinar: ["Friend finished webinar", PlayCircle], own_webinar: ["My webinar", GraduationCap] };

export default function CoinRewards() {
  const { data, isLoading } = useQuery({ queryKey: ["coin-rewards"], queryFn: () => api.get("/coin-rewards").then((r) => r.data) });
  if (isLoading) return <Loader />;
  return (
    <div data-testid="coin-rewards-page">
      <PageHeader title="Coin rewards" subtitle="Finzo Coins you earned and the actions that earned them." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Stat label="Total earned" value={coins(data.total)} icon={Coins} testid="coin-total" />
        {Object.entries(ACTIONS).map(([k, [l, I]]) => <Stat key={k} label={l} value={coins(data.by_action[k] || 0)} icon={I} tone="blue" testid={`coin-by-${k}`} hint={`+${data.amounts[k] ?? 0} each`} />)}
      </div>
      <Glass>{data.history.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="coin-history-table"><thead><tr><th>Date</th><th>How earned</th><th>From</th><th className="text-right">Coins</th></tr></thead>
        <tbody>{data.history.map((h) => <tr key={h.id}><td className="whitespace-nowrap">{fdate(h.created_at)}</td><td>{ACTIONS[h.action]?.[0] || h.action}</td><td>{h.from || "—"}</td><td className="text-right font-num text-emerald-300">+{coins(h.amount)}</td></tr>)}</tbody></table></div>
        : <Empty title="No coin rewards yet" text="Share your referral link from My team to start earning." />}</Glass>
    </div>
  );
}
