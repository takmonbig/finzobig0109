import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api, coins, errMsg, fdate } from "@/lib/api";
import { Glass, PageHeader, Loader, Empty, Field, Pager } from "@/components/common";
import { ACTIONS } from "@/pages/app/CoinRewards";

function Amounts({ initial }) {
  const qc = useQueryClient();
  const [a, setA] = useState(initial);
  const save = async () => {
    try { await api.put("/admin/settings", { referral_rewards: a }); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Reward amounts saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="space-y-3 mb-5" data-testid="coin-amounts-editor"><h3 className="font-semibold text-white">Coins per action</h3>
      <div className="grid sm:grid-cols-3 gap-3">{Object.entries(ACTIONS).map(([k, [l]]) => <Field key={k} label={l}><Input className="inp font-num" type="number" min={0} value={a[k] ?? 0} onChange={(e) => setA({ ...a, [k]: e.target.value })} data-testid={`coin-amount-${k}`} /></Field>)}</div>
      <button className="btn-gold" onClick={save} data-testid="coin-amounts-save-btn">Save amounts</button></Glass>
  );
}

export default function AdminCoinRewards() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const st = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get("/admin/settings").then((r) => r.data) });
  const { data, isLoading } = useQuery({ queryKey: ["admin-coin-rewards", q, page], queryFn: () => api.get("/admin/coin-rewards", { params: { q: q || undefined, page } }).then((r) => r.data) });
  return (
    <div data-testid="admin-coin-rewards-page">
      <PageHeader title="Coin rewards" subtitle="Fixed Finzo Coin rewards for referral actions. Not linked to deposits; not withdrawable." />
      {st.data && <Amounts initial={st.data.referral_rewards || {}} />}
      {data && <div className="grid grid-cols-3 gap-3 mb-4">{Object.entries(ACTIONS).map(([k, [l]]) => <Glass key={k} className="!p-3"><p className="text-xs text-slate-500">{l}</p><p className="font-num text-white" data-testid={`coin-total-${k}`}>{coins(data.totals[k]?.amount || 0)} · {data.totals[k]?.count || 0}×</p></Glass>)}</div>}
      <Glass>
        <Input className="inp max-w-xs mb-3" placeholder="Search user name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} data-testid="coin-search-input" />
        {isLoading ? <Loader /> : data.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="admin-coin-table"><thead><tr><th>Date</th><th>Earned by</th><th>How</th><th>From member</th><th className="text-right">Coins</th></tr></thead>
          <tbody>{data.items.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fdate(r.created_at)}</td><td>{r.user?.full_name}<p className="text-xs text-slate-500">{r.user?.email}</p></td><td>{ACTIONS[r.action]?.[0]}</td>
            <td>{r.source ? <>{r.source.full_name}<p className="text-xs text-slate-500">{r.source.email}</p></> : "—"}</td><td className="text-right font-num text-emerald-300">+{coins(r.amount)}</td></tr>)}</tbody></table></div> : <Empty title="No coin rewards yet" />}
        {data && <Pager page={page} size={data.size} total={data.total} onPage={setPage} testid="coin-pager" />}
      </Glass>
    </div>
  );
}
