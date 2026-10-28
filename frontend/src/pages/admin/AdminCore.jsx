import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, UserCheck, UserPlus, ShieldAlert, ArrowDownToLine, ArrowUpFromLine, LifeBuoy, BellRing, Gift, Search, Download, Layers } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api, coins, errMsg, fdate, downloadCsv } from "@/lib/api";
import { Glass, PageHeader, Stat, Loader, Empty, StatusBadge, Field, Pager, Confirm, RankBadge, PasswordInput } from "@/components/common";
import { TT, ChartCard } from "@/pages/app/UserPages";

export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const sel = "bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-sm h-10";
const COLORS = ["#64748b", "#fb923c", "#cbd5e1", "#F59E0B", "#67e8f9", "#a78bfa"];

function Overview() {
  const { data: d, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => get("/admin/overview"), refetchInterval: 60000 });
  if (isLoading) return <Loader />;
  return (
    <div data-testid="admin-overview">
      <PageHeader title="Platform overview" subtitle="Live figures from the database." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Registered users" value={d.total_users} icon={Users} testid="ad-total-users" /><Stat label="Active (7d)" value={d.active_users} icon={UserCheck} tone="emerald" testid="ad-active-users" />
        <Stat label="New registrations (7d)" value={d.new_registrations} icon={UserPlus} tone="blue" testid="ad-new-users" /><Stat label="Pending verification (KYC)" value={d.pending_kyc} icon={ShieldAlert} tone="violet" testid="ad-pending-kyc" />
        <Stat label="Pending deposit records" value={d.pending_deposits} icon={ArrowDownToLine} testid="ad-pending-deposits" hint={`${d.verified_deposits} verified`} />
        <Stat label="Pending withdrawals" value={d.pending_withdrawals} icon={ArrowUpFromLine} tone="blue" testid="ad-pending-withdrawals" />
        <Stat label="Open support tickets" value={d.open_tickets} icon={LifeBuoy} tone="violet" testid="ad-open-tickets" /><Stat label="Push subscriptions" value={d.push_subscriptions} icon={BellRing} tone="emerald" testid="ad-push-subs" />
        <Stat label="Reward requests" value={d.reward_requests} icon={Gift} testid="ad-reward-requests" /><Stat label="Active plans" value={d.active_enrollments} icon={Layers} tone="blue" testid="ad-active-sims" />
        <Stat label="Suspended accounts" value={d.suspended} icon={ShieldAlert} tone="violet" testid="ad-suspended" />
      </div>
      <div className="grid lg:grid-cols-2 gap-5 mt-6">
        <ChartCard title="Registrations (14 days)" tag="Database" testid="ad-chart-regs"><ResponsiveContainer><BarChart data={d.registrations}><CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Team membership distribution" tag="Database" testid="ad-chart-ranks"><ResponsiveContainer><PieChart><Pie data={d.rank_distribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
          {d.rank_distribution.map((_, i) => <Cell key={i} fill={COLORS[i % 6]} />)}</Pie><Tooltip {...TT} /><Legend /></PieChart></ResponsiveContainer></ChartCard>
      </div>
      <Glass className="mt-5" data-testid="ad-alerts"><h3 className="font-semibold text-white mb-3">System alerts</h3>
        {d.alerts.length ? d.alerts.map((a) => <div key={a.id} className="flex justify-between gap-3 py-2 border-b border-slate-800 text-sm"><span><StatusBadge status={a.severity === "warning" ? "pending" : "failed"} /> <span className="ml-2">{a.type}</span> <span className="text-xs text-slate-500">{a.ip}</span></span><span className="text-xs text-slate-500">{fdate(a.created_at)}</span></div>) : <Empty title="No alerts" />}
      </Glass>
    </div>
  );
}

function Downline({ id, onOpen }) {
  const [q, setQ] = useState("");
  const [gen, setGen] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["admin-downline", id], queryFn: () => get(`/admin/users/${id}/downline`) });
  if (isLoading) return <Loader />;
  const rows = data.items.filter((r) => (!gen || r.generation === Number(gen)) && (!q || `${r.full_name} ${r.email}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3" data-testid="ud-downline">
      <div className="flex flex-wrap gap-2 text-xs">{data.by_generation.map((c, i) => <span key={i} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800">T{i + 1}: <b className="text-white">{c}</b></span>)}<span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-200">Total {data.total}</span>
        <button className="btn-ghost !py-1 !px-3 !text-xs ml-auto" disabled={!data.total} onClick={() => downloadCsv(`/admin/users/${id}/downline/export?q=${encodeURIComponent(q)}&generation=${gen || 0}`, `downline_${id}${gen ? `_T${gen}` : ""}.csv`)} data-testid="ud-downline-export-btn"><Download className="w-3.5 h-3.5" />Download spreadsheet</button></div>
      <div className="flex gap-2"><Input className="inp" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ud-downline-search" />
        <select className={sel} value={gen} onChange={(e) => setGen(e.target.value)} data-testid="ud-downline-gen"><option value="">All</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{`T${g}`}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Gen</th><th>Member</th><th>Contact</th><th>Rank</th><th>Status</th><th>Joined</th><th>Last login</th><th>Last active</th><th>USDT bal.</th><th>Deposited</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)} data-testid={`ud-downline-row-${r.id}`}>
          <td className="font-num">T{r.generation}</td><td><p className="text-white">{r.full_name}</p><p className="text-[11px] text-slate-500">{r.referral_code}</p></td>
          <td className="text-xs"><p>{r.email}</p><p className="text-slate-500">{r.country_code} {r.mobile}</p></td><td><RankBadge rank={r.rank} /></td><td><StatusBadge status={r.deleted ? "deleted" : r.status} /></td>
          <td className="text-xs whitespace-nowrap">{fdate(r.created_at)}</td><td className="text-xs whitespace-nowrap">{r.last_login_at ? fdate(r.last_login_at) : "—"}</td><td className="text-xs whitespace-nowrap">{r.last_active_at ? fdate(r.last_active_at) : "—"}</td>
          <td className="font-num">{coins(r.usdt_balance)}</td><td className="font-num">{coins(r.verified_deposits)}</td></tr>)}</tbody></table></div>
      {!rows.length && <Empty title="No downline members" />}
    </div>
  );
}

function SetPassword({ id }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/admin/users/${id}/password`, { new_password: pw }); toast.success("New password set. The user was signed out of all devices."); setPw(""); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="border-t border-slate-800 pt-3"><p className="text-sm font-semibold text-white mb-2">Set a new password</p>
      <div className="flex gap-2"><PasswordInput wrapperClassName="flex-1" placeholder="Min 8 characters, letters + numbers" value={pw} onChange={(e) => setPw(e.target.value)} testid="ud-new-password-input" />
        <button className="btn-gold shrink-0" disabled={busy || pw.length < 8} onClick={save} data-testid="ud-set-password-btn">Set password</button></div></div>
  );
}

function ProgressReport() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["progress-report"], queryFn: () => get("/admin/reports/progress") });
  if (isLoading) return <Loader />;
  const rows = data.items.filter((r) => !q || `${r.full_name} ${r.email}`.toLowerCase().includes(q.toLowerCase()));
  const Bar = ({ v }) => <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${Math.min(100, v)}%` }} /></div>;
  return (
    <Glass data-testid="progress-report">
      <div className="flex flex-wrap gap-2 mb-3 text-xs">{Object.entries(data.rank_counts).map(([k, v]) => <span key={k} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800">{k}: <b className="text-white">{v}</b></span>)}</div>
      <Input className="inp mb-3" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} data-testid="progress-search" />
      <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Member</th><th>Rank</th><th>Direct / team</th><th>Next rank</th><th>Rank progress</th><th>Team volume</th><th>Rewards reached</th><th>Next reward</th><th>Reward progress</th><th>Claims</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} data-testid={`progress-row-${r.id}`}><td><p className="text-white">{r.full_name}</p><p className="text-[11px] text-slate-500">{r.email}</p></td><td><RankBadge rank={r.rank} /></td>
          <td className="font-num">{r.direct} / {r.team}</td><td className="text-xs">{r.next_rank ? <>{r.next_rank}<p className="text-slate-500">needs {r.next_rank_needs.direct} direct, {r.next_rank_needs.team} team</p></> : "Top rank"}</td>
          <td><div className="flex items-center gap-2"><Bar v={r.rank_progress} /><span className="font-num text-xs">{r.rank_progress}%</span></div></td><td className="font-num">{coins(r.team_volume, 0)}</td>
          <td className="text-xs">{r.rewards_reached.join(", ") || "—"}</td><td className="text-xs">{r.next_reward || "All reached"}</td>
          <td><div className="flex items-center gap-2"><Bar v={r.reward_progress} /><span className="font-num text-xs">{r.reward_progress}%</span></div></td><td className="text-xs">{r.claims.join(", ") || "—"}</td></tr>)}</tbody></table></div>
      {!rows.length && <Empty title="No members" />}
    </Glass>
  );
}

function UserDetail({ id, onClose, onOpen }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-user", id], queryFn: () => get(`/admin/users/${id}`), enabled: !!id });
  const [adj, setAdj] = useState({ account: "demo_coins", amount: "", memo: "" });
  const patch = async (body) => { try { await api.patch(`/admin/users/${id}`, body); toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-user", id] }); qc.invalidateQueries({ queryKey: ["admin-users"] }); } catch (e) { toast.error(errMsg(e)); } };
  const adjust = async () => { try { await api.post(`/admin/users/${id}/adjust`, { ...adj, amount: Number(adj.amount) }); toast.success("Ledger adjustment posted"); setAdj({ ...adj, amount: "", memo: "" }); qc.invalidateQueries({ queryKey: ["admin-user", id] }); } catch (e) { toast.error(errMsg(e)); } };
  const u = data?.user;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-3xl max-h-[88vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0" data-testid="admin-user-dialog">
        {isLoading || !u ? <><DialogHeader><DialogTitle className="sr-only">Loading user</DialogTitle></DialogHeader><Loader /></> : (<>
          <DialogHeader><DialogTitle className="flex items-center gap-3">{u.full_name} <RankBadge rank={u.rank} /> <StatusBadge status={u.status} /></DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p>Email: <span className="text-white">{u.email}</span></p><p>Mobile: {u.country_code} {u.mobile} {u.mobile_verified ? "✓" : "(unverified)"}</p>
            <p>Referral code: <span className="font-num">{u.referral_code}</span></p><p>Referrer: {data.referrer ? `${data.referrer.full_name} (${data.referrer.email})` : "—"}</p>
            <p>Direct / team: {data.direct} / {data.team}</p><p>Team volume: {coins(data.team_volume, 0)}</p><p>Joined: {fdate(u.created_at)}</p><p>Active sessions: {data.active_sessions}</p>
            <p>Last login: {u.last_login_at ? fdate(u.last_login_at) : "—"} {u.last_login_ip ? `· ${u.last_login_ip}` : ""}</p><p>Last active: {u.last_active_at ? fdate(u.last_active_at) : "—"}</p>
            <p>Country: {u.country || "—"}</p><p>2FA: {u.totp_enabled ? "on" : "off"}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Object.entries(data.wallets).map(([k, w]) => <div key={k} className="rounded-xl bg-slate-950/60 border border-slate-800 p-2"><p className="text-[10px] text-slate-500">{k}</p><p className="font-num text-sm">{coins(w.balance)}</p></div>)}</div>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <Field label="KYC status"><select className={sel + " w-full"} value={u.kyc_status} onChange={(e) => patch({ kyc_status: e.target.value })} data-testid="ud-kyc-select">{["not_submitted", "pending", "verified", "rejected"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Group"><Input className="inp" defaultValue={u.group} onBlur={(e) => e.target.value !== u.group && patch({ group: e.target.value })} data-testid="ud-group-input" /></Field>
            <label className="flex items-center gap-2 text-sm pb-2">Messaging disabled <Switch checked={!!u.messaging_disabled} onCheckedChange={(v) => patch({ messaging_disabled: v })} data-testid="ud-messaging-switch" /></label>
          </div>
          <SetPassword id={id} />
          <div className="border-t border-slate-800 pt-3"><p className="text-sm font-semibold text-white mb-2">Ledger adjustment (coins / promo only)</p>
            <div className="grid sm:grid-cols-[130px_120px_1fr_auto] gap-2"><select className={sel} value={adj.account} onChange={(e) => setAdj({ ...adj, account: e.target.value })} data-testid="ud-adj-account"><option>demo_coins</option><option>promo</option></select>
              <Input className="inp font-num" type="number" placeholder="+/- amount" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} data-testid="ud-adj-amount" />
              <Input className="inp" placeholder="Reason (audited)" value={adj.memo} onChange={(e) => setAdj({ ...adj, memo: e.target.value })} data-testid="ud-adj-memo" />
              <button className="btn-gold !py-2" disabled={!adj.amount || adj.memo.length < 3} onClick={adjust} data-testid="ud-adj-btn">Post</button></div></div>
          <Tabs defaultValue="dl" className="min-w-0"><TabsList className="bg-slate-900 flex-wrap h-auto"><TabsTrigger value="dl" data-testid="ud-tab-downline">Downline</TabsTrigger><TabsTrigger value="dep">Deposits</TabsTrigger><TabsTrigger value="wd">Withdrawals</TabsTrigger><TabsTrigger value="lg" data-testid="ud-tab-ledger">Ledger</TabsTrigger><TabsTrigger value="ss" data-testid="ud-tab-sessions">Logins & sessions</TabsTrigger><TabsTrigger value="en">Plans</TabsTrigger><TabsTrigger value="rk">Rank history</TabsTrigger></TabsList>
            <TabsContent value="dl"><Downline id={id} onOpen={onOpen} /></TabsContent>
            <TabsContent value="lg"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Memo</th><th>Amount</th><th>Balance</th></tr></thead>
              <tbody>{data.ledger.map((e) => <tr key={e.id}><td className="text-xs whitespace-nowrap">{fdate(e.created_at)}</td><td className="text-xs">{e.account}</td><td className="text-xs">{e.type}</td><td className="text-xs">{e.memo}</td><td className={`font-num ${e.amount >= 0 ? "text-emerald-300" : "text-red-300"}`}>{coins(e.amount)}</td><td className="font-num">{coins(e.balance_after)}</td></tr>)}</tbody></table></div></TabsContent>
            <TabsContent value="ss"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Signed in</th><th>Last seen</th><th>IP</th><th>Device</th><th>State</th></tr></thead>
              <tbody>{data.sessions.map((s) => <tr key={s.id}><td className="text-xs whitespace-nowrap">{fdate(s.created_at)}</td><td className="text-xs whitespace-nowrap">{s.last_seen_at ? fdate(s.last_seen_at) : "—"}</td><td className="font-num text-xs">{s.ip}</td><td className="text-[11px] text-slate-400 max-w-[220px] truncate">{s.user_agent}</td><td><StatusBadge status={s.revoked ? "revoked" : "active"} /></td></tr>)}</tbody></table></div>
              {data.security_events.length > 0 && <div className="mt-3"><p className="text-xs text-slate-400 mb-1">Security events</p>{data.security_events.map((e) => <p key={e.id} className="text-xs py-1 border-b border-slate-800">{fdate(e.created_at)} · {e.type} · {e.ip}</p>)}</div>}</TabsContent>
            <TabsContent value="dep">{data.deposits.map((d) => <p key={d.id} className="text-xs py-1 border-b border-slate-800">{fdate(d.created_at)} · {d.method_name} · {coins(d.amount)} · <StatusBadge status={d.status} /></p>)}</TabsContent>
            <TabsContent value="wd">{data.withdrawals.map((d) => <p key={d.id} className="text-xs py-1 border-b border-slate-800">{fdate(d.created_at)} · {coins(d.amount)} · <StatusBadge status={d.status} /></p>)}</TabsContent>
            <TabsContent value="en">{data.enrollments.map((d) => <p key={d.id} className="text-xs py-1 border-b border-slate-800">{d.plan_name} · {coins(d.amount)} · {d.days_credited}/{d.duration_days} · <StatusBadge status={d.status} /></p>)}</TabsContent>
            <TabsContent value="rk">{data.rank_history.map((h) => <p key={h.id} className="text-xs py-1 border-b border-slate-800">{fdate(h.created_at)} · {h.from} → {h.to}</p>)}</TabsContent>
          </Tabs>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

function UsersPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ q: "", status: "", rank: "", kyc: "", page: 1 });
  const [picked, setPicked] = useState([]);
  const [open, setOpen] = useState(null);
  const [ann, setAnn] = useState(null);
  const [val, setVal] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["admin-users", f], queryFn: () => get("/admin/users", { ...f, size: 20 }) });
  const bulk = useMutation({
    mutationFn: (body) => api.post("/admin/users/bulk", { ids: picked, confirm: true, ...body }),
    onSuccess: (r) => { toast.success(`${r.data.affected} account(s) updated`); setPicked([]); setAnn(null); qc.invalidateQueries({ queryKey: ["admin-users"] }); }, onError: (e) => toast.error(errMsg(e)),
  });
  const all = data?.items.every((u) => picked.includes(u.id)) && data?.items.length;
  const toggleAll = () => setPicked(all ? [] : data.items.map((u) => u.id));
  return (
    <div data-testid="admin-users-page">
      <PageHeader title="User management" actions={<button className="btn-ghost" onClick={() => downloadCsv(`/admin/users/export?${new URLSearchParams(picked.length ? { ids: picked.join(",") } : { q: f.q, status: f.status, rank: f.rank, kyc: f.kyc })}`, "users.csv")} data-testid="users-export-btn"><Download className="w-4 h-4" />Export {picked.length ? "selected" : "filtered"}</button>} />
      <Glass>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" /><Input className="inp pl-9" placeholder="Search name, email, code, mobile" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} data-testid="users-search-input" /></div>
          <select className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })} data-testid="users-status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Soft-deleted</option></select>
          <select className={sel} value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value, page: 1 })} data-testid="users-rank-filter"><option value="">All ranks</option>{["Member", "Bronze", "Silver", "Gold", "Platinum", "Diamond"].map((r) => <option key={r}>{r}</option>)}</select>
          <select className={sel} value={f.kyc} onChange={(e) => setF({ ...f, kyc: e.target.value, page: 1 })} data-testid="users-kyc-filter"><option value="">Any KYC</option>{["not_submitted", "pending", "verified", "rejected"].map((r) => <option key={r}>{r}</option>)}</select>
        </div>
        {picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/30" data-testid="bulk-bar">
            <span className="text-sm text-amber-200 mr-2" data-testid="bulk-count">{picked.length} selected</span>
            <Confirm testid="bulk-suspend" title={`Suspend ${picked.length} account(s)?`} description="Users will be signed out and blocked. Ranks of their uplines are recalculated." onConfirm={() => bulk.mutate({ action: "suspend" })} trigger={<button className="btn-ghost !py-1.5 text-sm" data-testid="bulk-suspend-btn">Suspend</button>} />
            <button className="btn-ghost !py-1.5 text-sm" onClick={() => bulk.mutate({ action: "reactivate" })} data-testid="bulk-reactivate-btn">Reactivate</button>
            <Confirm testid="bulk-delete" title={`Soft-delete ${picked.length} account(s)?`} description="Accounts are hidden and disabled. Financial and audit records are retained, never erased." onConfirm={() => bulk.mutate({ action: "soft_delete" })} trigger={<button className="btn-ghost !py-1.5 text-sm !text-red-300" data-testid="bulk-delete-btn">Soft delete</button>} />
            <select className={sel + " !h-9"} defaultValue="" onChange={(e) => e.target.value && bulk.mutate({ action: "set_kyc", value: e.target.value })} data-testid="bulk-kyc-select"><option value="">Set KYC…</option>{["pending", "verified", "rejected"].map((s) => <option key={s}>{s}</option>)}</select>
            <Input className="inp !h-9 w-32" placeholder="Group" value={val} onChange={(e) => setVal(e.target.value)} data-testid="bulk-group-input" /><button className="btn-ghost !py-1.5 text-sm" disabled={!val} onClick={() => bulk.mutate({ action: "set_group", value: val })} data-testid="bulk-group-btn">Set group</button>
            <button className="btn-gold !py-1.5 text-sm" onClick={() => setAnn({ title: "", message: "" })} data-testid="bulk-announce-btn">Announce</button>
          </div>
        )}
        {isLoading ? <Loader /> : data.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="users-table"><thead><tr><th><input type="checkbox" checked={!!all} onChange={toggleAll} className="accent-amber-500" data-testid="users-select-all" /></th><th>Name</th><th>Email</th><th>Rank</th><th>KYC</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{data.items.map((u) => <tr key={u.id} className="cursor-pointer" onClick={() => setOpen(u.id)} data-testid={`user-row-${u.email}`}>
            <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-amber-500" checked={picked.includes(u.id)} onChange={() => setPicked(picked.includes(u.id) ? picked.filter((x) => x !== u.id) : [...picked, u.id])} data-testid={`user-select-${u.email}`} /></td>
            <td className="text-white">{u.full_name}{u.role === "super_admin" && <span className="text-[10px] text-amber-400 ml-1">ADMIN</span>}</td><td>{u.email}</td><td><RankBadge rank={u.rank} /></td><td><StatusBadge status={u.kyc_status} /></td><td><StatusBadge status={u.deleted ? "removed" : u.status} /></td><td className="whitespace-nowrap">{fdate(u.created_at)}</td></tr>)}</tbody></table></div> : <Empty title="No users match" />}
        {data && <Pager page={f.page} size={20} total={data.total} onPage={(p) => setF({ ...f, page: p })} />}
      </Glass>
      <UserDetail id={open} onClose={() => setOpen(null)} onOpen={setOpen} />
      <Dialog open={!!ann} onOpenChange={(o) => !o && setAnn(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20"><DialogHeader><DialogTitle>Announce to {picked.length} user(s)</DialogTitle></DialogHeader>
          {ann && <><Input className="inp" placeholder="Title" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} data-testid="bulk-ann-title" />
            <Textarea className="inp" placeholder="Message (links are detected safely)" value={ann.message} onChange={(e) => setAnn({ ...ann, message: e.target.value })} data-testid="bulk-ann-message" />
            <button className="btn-gold" disabled={!ann.title || !ann.message} onClick={() => bulk.mutate({ action: "announce", ...ann })} data-testid="bulk-ann-send">Send popup announcement</button></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamAdmin() {
  const qc = useQueryClient();
  const an = useQuery({ queryKey: ["anomalies"], queryFn: () => get("/admin/team/anomalies") });
  const rv = useQuery({ queryKey: ["rank-review"], queryFn: () => get("/admin/ranks/review") });
  const msgs = useQuery({ queryKey: ["admin-team-msgs"], queryFn: () => get("/admin/team-messages") });
  const [uid, setUid] = useState("");
  const [insp, setInsp] = useState(null);
  const inspect = async (id) => { try { setInsp(await get(`/admin/team/inspect/${id || uid}`)); } catch (e) { toast.error(errMsg(e)); } };
  const recompute = useMutation({ mutationFn: () => api.post("/admin/ranks/recompute"), onSuccess: (r) => { toast.success(`Recomputed ${r.data.processed} users`); qc.invalidateQueries({ queryKey: ["rank-review"] }); } });
  const hide = async (m) => { await api.post(`/admin/team-messages/${m.id}/hide`); toast.success("Message removed"); qc.invalidateQueries({ queryKey: ["admin-team-msgs"] }); };
  const disable = async (m) => { await api.patch(`/admin/users/${m.sender_id}`, { messaging_disabled: true }); toast.success("Messaging disabled for sender"); };
  return (
    <div data-testid="admin-team-page">
      <PageHeader title="Team management & moderation" />
      <Tabs defaultValue="progress"><TabsList className="bg-slate-900 flex-wrap h-auto mb-4">
        <TabsTrigger value="progress" data-testid="at-tab-progress">Rank & reward progress</TabsTrigger>
        <TabsTrigger value="ranks" data-testid="at-tab-ranks">Rank qualifications</TabsTrigger><TabsTrigger value="inspect" data-testid="at-tab-inspect">Inspect relationships</TabsTrigger>
        <TabsTrigger value="anom" data-testid="at-tab-anomalies">Anomalies</TabsTrigger><TabsTrigger value="msgs" data-testid="at-tab-messages">Announcement moderation</TabsTrigger></TabsList>
        <TabsContent value="progress"><ProgressReport /></TabsContent>
        <TabsContent value="ranks"><Glass><div className="flex justify-between mb-3"><h3 className="font-semibold text-white">Ranked members</h3><button className="btn-ghost !py-1.5 text-sm" onClick={() => recompute.mutate()} disabled={recompute.isPending} data-testid="recompute-ranks-btn">Recompute all ranks</button></div>
          {rv.data?.ranked.length ? <table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Rank</th><th>Direct</th><th>Team</th><th /></tr></thead><tbody>{rv.data.ranked.map((r) => <tr key={r.id}><td>{r.full_name}</td><td>{r.email}</td><td><RankBadge rank={r.rank} /></td><td className="font-num">{r.direct}</td><td className="font-num">{r.team}</td><td><button className="text-xs text-amber-400" onClick={() => inspect(r.id)}>Inspect</button></td></tr>)}</tbody></table> : <Empty title="No ranked members" />}
        </Glass></TabsContent>
        <TabsContent value="inspect"><Glass className="space-y-3"><div className="flex gap-2"><Input className="inp" placeholder="User ID" value={uid} onChange={(e) => setUid(e.target.value)} data-testid="inspect-user-input" /><button className="btn-gold" onClick={() => inspect()} data-testid="inspect-btn">Inspect</button></div>
          {insp && <div className="text-sm space-y-2" data-testid="inspect-result"><p className="text-white">{insp.user.full_name} ({insp.user.email}) — stored {insp.user.rank}, computed <span className="text-amber-300">{insp.computed_rank}</span></p>
            <p>Upline: {insp.upline.map((u, i) => `G${i + 1}: ${u.full_name}`).join(" → ") || "none"}</p><p>Generations: {insp.generations.join(" / ")} · direct {insp.direct} · team {insp.team}</p></div>}</Glass></TabsContent>
        <TabsContent value="anom"><div className="grid lg:grid-cols-2 gap-5"><Glass><h3 className="font-semibold text-white mb-3">Shared registration IPs (possible duplicates)</h3>
          {an.data?.ip_clusters.length ? an.data.ip_clusters.map((c) => <div key={c.ip} className="py-2 border-b border-slate-800 text-sm"><p className="font-num">{c.ip} · {c.count} accounts</p><p className="text-xs text-slate-500 break-all">{c.emails.join(", ")}</p></div>) : <Empty title="No clusters" />}</Glass>
          <Glass><h3 className="font-semibold text-white mb-3">Suspicious events</h3>{an.data?.events.length ? an.data.events.map((e) => <p key={e.id} className="text-xs py-1.5 border-b border-slate-800">{fdate(e.created_at)} · {e.type} · {e.ip}</p>) : <Empty title="No events" />}</Glass></div></TabsContent>
        <TabsContent value="msgs"><Glass>{msgs.data?.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="moderation-table"><thead><tr><th>Sent</th><th>Sender</th><th>Title / message</th><th>Delivered</th><th>Reports</th><th>Status</th><th /></tr></thead>
          <tbody>{msgs.data.map((m) => <tr key={m.id}><td className="whitespace-nowrap">{fdate(m.created_at)}</td><td>{m.sender_name}</td><td className="max-w-[300px]"><p className="text-white">{m.title}</p><p className="text-xs text-slate-400 truncate">{m.message}</p>{m.report_reasons?.map((r, i) => <p key={i} className="text-xs text-red-300">Report: {r.reason}</p>)}</td>
            <td className="font-num">{m.delivered}/{m.targeted}</td><td className="font-num">{m.reports}</td><td><StatusBadge status={m.status} /></td>
            <td className="space-x-2 whitespace-nowrap">{!m.hidden && <button className="text-xs text-red-300" onClick={() => hide(m)} data-testid={`hide-msg-${m.id}`}>Remove</button>}<button className="text-xs text-amber-300" onClick={() => disable(m)} data-testid={`disable-sender-${m.id}`}>Disable sender</button></td></tr>)}</tbody></table></div> : <Empty title="No team announcements" />}</Glass></TabsContent>
      </Tabs>
    </div>
  );
}

function Logs() {
  const [ap, setAp] = useState(1);
  const [sp, setSp] = useState(1);
  const [q, setQ] = useState("");
  const audit = useQuery({ queryKey: ["audit", ap, q], queryFn: () => get("/admin/audit-logs", { page: ap, q }) });
  const sec = useQuery({ queryKey: ["sec", sp], queryFn: () => get("/admin/security-events", { page: sp }) });
  const out = useQuery({ queryKey: ["outbox"], queryFn: () => get("/admin/email-outbox") });
  return (
    <div data-testid="admin-logs-page">
      <PageHeader title="Audit & security" subtitle="Append-only records of administrator actions and security events." />
      <Tabs defaultValue="audit"><TabsList className="bg-slate-900 mb-4"><TabsTrigger value="audit" data-testid="logs-tab-audit">Admin audit log</TabsTrigger><TabsTrigger value="sec" data-testid="logs-tab-security">Security events</TabsTrigger><TabsTrigger value="mail" data-testid="logs-tab-email">Email outbox (mocked)</TabsTrigger></TabsList>
        <TabsContent value="audit"><Glass><Input className="inp mb-3 max-w-xs" placeholder="Filter by action" value={q} onChange={(e) => { setQ(e.target.value); setAp(1); }} data-testid="audit-filter-input" />
          {audit.data?.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="audit-table"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>{audit.data.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap">{fdate(a.created_at)}</td><td>{a.admin_email}</td><td className="text-amber-200">{a.action}</td><td className="text-xs">{a.target_type} {a.target_id?.slice(0, 8)}</td><td className="text-xs font-num max-w-[320px] break-all">{JSON.stringify(a.details)}</td></tr>)}</tbody></table></div> : <Empty />}
          {audit.data && <Pager page={ap} size={30} total={audit.data.total} onPage={setAp} />}</Glass></TabsContent>
        <TabsContent value="sec"><Glass>{sec.data?.items.length ? <table className="tbl"><thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>IP</th><th>Details</th></tr></thead>
          <tbody>{sec.data.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap">{fdate(a.created_at)}</td><td>{a.type}</td><td>{a.severity}</td><td className="font-num text-xs">{a.ip}</td><td className="text-xs font-num break-all">{JSON.stringify(a.details)}</td></tr>)}</tbody></table> : <Empty />}
          {sec.data && <Pager page={sp} size={30} total={sec.data.total} onPage={setSp} />}</Glass></TabsContent>
        <TabsContent value="mail"><Glass><p className="text-xs text-violet-300 mb-3">Email delivery is not connected yet. Messages are stored here instead of being sent.</p>
          {out.data?.length ? out.data.map((m) => <div key={m.id} className="py-2 border-b border-slate-800 text-sm"><p>{m.to} · {m.subject} · <span className="text-xs text-slate-500">{fdate(m.created_at)}</span></p><p className="text-xs font-num text-slate-400 break-all" data-testid="outbox-body">{m.body}</p></div>) : <Empty />}</Glass></TabsContent>
      </Tabs>
    </div>
  );
}

const PAGES = { overview: Overview, users: UsersPage, team: TeamAdmin, logs: Logs };
export default function AdminCore({ page }) {
  const P = PAGES[page];
  return <P />;
}
