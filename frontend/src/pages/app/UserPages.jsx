import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Coins, Layers, TrendingUp, Users, Award, Bell, Activity, ArrowDownToLine, ArrowUpFromLine, Network, Trophy, LifeBuoy, UserCog, Megaphone, Flag, CheckCheck, Smartphone, KeyRound, MonitorSmartphone, Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { api, coins, errMsg, fdate, newKey } from "@/lib/api";
import { enablePush, disablePush, permission } from "@/lib/push";
import { useAuth } from "@/context/AuthContext";
import { GuidesGrid } from "@/pages/app/Learn";
import { CoinRateCard } from "@/components/home/TeamRate";
import { useSite } from "@/components/common";
import { ReferPlanButton } from "@/components/ReferPlan";
import { Glass, PageHeader, Stat, Loader, Empty, ErrorBox, StatusBadge, DemoTag, Field, Pager, Confirm, LinkText, TelegramButton, RankBadge, PasswordInput } from "@/components/common";

export const TT = { contentStyle: { background: "#0C1120", border: "1px solid #334155", borderRadius: 12, fontSize: 12 } };
const COLORS = ["#F59E0B", "#3B82F6", "#8B5CF6", "#10B981", "#EC4899", "#06B6D4", "#EF4444"];
const get = (url, params) => api.get(url, { params }).then((r) => r.data);

export function ChartCard({ title, tag = "Your records", children, testid }) {
  return (
    <Glass data-testid={testid}>
      <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-white text-sm">{title}</h3><span className="text-[10px] uppercase tracking-widest text-slate-500">{tag}</span></div>
      <div className="h-56">{children}</div>
    </Glass>
  );
}

function Banners() {
  const { data = [] } = useQuery({ queryKey: ["banners"], queryFn: () => get("/announcements/dashboard") });
  return data.map((b) => (
    <div key={b.id} className="glass p-4 mb-4 border-blue-500/30 flex gap-3" data-testid="dashboard-announcement">
      <Megaphone className="w-5 h-5 text-blue-300 shrink-0" />
      <div className="text-sm"><p className="font-semibold text-white">{b.title}</p><LinkText text={b.message} className="text-slate-300" /></div>
    </div>
  ));
}

const QUICK = [["Deposit information", "/app/deposit", ArrowDownToLine], ["Withdrawal information", "/app/withdraw", ArrowUpFromLine], ["Wallet & ledger", "/app/wallet", Coins], ["My team", "/app/team", Network],
  ["Rewards", "/app/rewards", Trophy], ["Notifications", "/app/notifications", Bell], ["Support", "/app/support", LifeBuoy], ["Profile settings", "/app/profile", UserCog]];

function OverviewRate() {
  const { data } = useSite();
  const r = data?.content?.coin_rate;
  return r?.price_usd ? <div className="mb-5"><CoinRateCard rate={r} name={data.settings?.coin?.name} symbol={data.settings?.coin?.symbol} /></div> : null;
}

function Overview() {
  const { data: d, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => get("/dashboard") });
  if (isLoading) return <Loader />;
  if (error) return <ErrorBox error={errMsg(error)} />;
  const w = d.wallets;
  return (
    <div data-testid="user-overview">
      <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="Account overview" subtitle="Your USDT wallet and team at a glance." /><ReferPlanButton /></div>
      <Banners />
      <OverviewRate />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Team members" value={d.team} icon={Users} tone="blue" testid="stat-team" hint={`${d.direct} direct`} />
        <Stat label="Current rank" value={d.rank} icon={Award} testid="stat-rank" />
        <Stat label="Unread notifications" value={d.unread} icon={Bell} tone="violet" testid="stat-unread" />
        <Stat label="USDT balance" value={coins(w.verified?.available)} icon={Coins} tone="emerald" testid="stat-verified" hint="Withdrawable" />
      </div>
      <div className="grid sm:grid-cols-4 lg:grid-cols-8 gap-3 my-6">
        {QUICK.map(([l, to, I]) => (
          <Link key={to} to={to} className="glass glass-hover p-3 flex flex-col items-center gap-2 text-center" data-testid={`quick-${to.split("/").pop()}`}>
            <I className="w-5 h-5 text-amber-400" /><span className="text-xs text-slate-300">{l}</span>
          </Link>
        ))}
      </div>
      <GuidesGrid />
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Balance history" testid="chart-balance"><ResponsiveContainer><AreaChart data={d.charts.balance}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="#64748b" fontSize={11} /><YAxis stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Legend />
          <Area dataKey="demo_coins" name="Coins" stroke="#F59E0B" fill="#F59E0B33" /><Area dataKey="sim_earnings" name="Plan earnings" stroke="#8B5CF6" fill="#8B5CF633" />
        </AreaChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Account activity" testid="chart-activity"><ResponsiveContainer><BarChart data={d.charts.activity}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="#64748b" fontSize={11} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} /><Tooltip {...TT} />
          <Bar dataKey="events" name="Ledger events" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Team growth & referral activity" testid="chart-team"><ResponsiveContainer><LineChart data={d.charts.growth}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="#64748b" fontSize={11} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Legend />
          <Line dataKey="team" name="New team members" stroke="#10B981" dot={false} /><Line dataKey="direct" name="Direct referrals" stroke="#F59E0B" dot={false} />
        </LineChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Transaction status" testid="chart-status">{d.charts.status.length ? <ResponsiveContainer><PieChart>
          <Pie data={d.charts.status} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>{d.charts.status.map((_, i) => <Cell key={i} fill={COLORS[i % 7]} />)}</Pie><Tooltip {...TT} /><Legend />
        </PieChart></ResponsiveContainer> : <Empty title="No payment records yet" />}</ChartCard>
      </div>
      <Glass className="mt-5" data-testid="recent-activity">
        <h3 className="font-semibold text-white mb-3">Recent activity</h3>
        {d.recent.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Account</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{d.recent.map((e) => <tr key={e.id}><td>{fdate(e.created_at)}</td><td>{e.memo || e.type}</td><td>{e.account}</td><td className={`text-right font-num ${e.amount < 0 ? "text-red-300" : "text-emerald-300"}`}>{coins(e.amount)}</td></tr>)}</tbody></table></div> : <Empty />}
      </Glass>
    </div>
  );
}

function Entries({ en, onClose }) {
  const { data, isLoading } = useQuery({ queryKey: ["entries", en?.id], queryFn: () => get(`/enrollments/${en.id}/entries`), enabled: !!en });
  return (
    <Dialog open={!!en} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{en?.plan_name} · daily entries</DialogTitle></DialogHeader>
        {isLoading ? <Loader /> : data?.length ? <table className="tbl"><thead><tr><th>Day</th><th>Amount</th><th>Recorded</th></tr></thead>
          <tbody>{data.map((x) => <tr key={x.id}><td className="font-num">{x.day_index}</td><td className="font-num text-violet-300">{coins(x.amount)}</td><td>{fdate(x.created_at)}</td></tr>)}</tbody></table> : <Empty title="No calculation entries yet" text="Entries are generated by the daily simulation engine." />}
      </DialogContent>
    </Dialog>
  );
}

function Plans() {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => get("/plans") });
  const ens = useQuery({ queryKey: ["enrollments"], queryFn: () => get("/enrollments") });
  const [view, setView] = useState(null);
  const enroll = useMutation({
    mutationFn: (p) => api.post(`/plans/${p.id}/enroll`, { idem_key: newKey() }),
    onSuccess: () => { toast.success("Plan started"); ["enrollments", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div data-testid="plans-page">
      <PageHeader title="Participation plans" subtitle="Choose a plan and follow its daily progress from your dashboard." />
      {plans.isLoading ? <Loader /> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.data.map((p, i) => (
            <Glass key={p.id} className="glass-hover flex flex-col" data-testid={`user-plan-${i}`}>
              <div className="flex justify-between items-center"><h3 className="text-white font-semibold">{p.name}</h3></div>
              <p className="font-num text-2xl text-amber-300 mt-2">{coins(p.deposit, 0)} <span className="text-xs text-slate-500">DC</span></p>
              <p className="text-xs text-slate-400 mt-2 flex-1">{p.description}</p>
              <div className="grid grid-cols-3 gap-2 text-xs my-4"><div><p className="text-slate-500">Daily</p><p className="font-num">{coins(p.daily, 0)}</p></div>
                <div><p className="text-slate-500">Days</p><p className="font-num">{p.duration_days}</p></div><div><p className="text-slate-500">Total</p><p className="font-num">{coins(p.total_payout, 0)}</p></div></div>
              <Confirm testid={`enroll-confirm-${i}`} title={`Start ${p.name}?`} description={`${coins(p.deposit, 0)} coins will be allocated to ${p.name}.`}
                onConfirm={() => enroll.mutate(p)} confirmLabel="Start plan"
                trigger={<button className="btn-gold w-full" disabled={enroll.isPending} data-testid={`enroll-btn-${i}`}>Start plan</button>} />
            </Glass>
          ))}
        </div>
      )}
      <Glass className="mt-6" data-testid="enrollments-table">
        <h3 className="font-semibold text-white mb-3">My plans</h3>
        {ens.isLoading ? <Loader /> : ens.data?.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Plan</th><th>Amount</th><th>Progress</th><th>Credited</th><th>Status</th><th>Started</th><th /></tr></thead>
          <tbody>{ens.data.map((e) => <tr key={e.id}><td>{e.plan_name} <span className="text-xs text-slate-500">v{e.plan_version}</span></td><td className="font-num">{coins(e.amount)}</td>
            <td className="min-w-[140px]"><Progress value={(e.days_credited / e.duration_days) * 100} className="h-1.5" /><span className="text-xs text-slate-500">{e.days_credited}/{e.duration_days} days</span></td>
            <td className="font-num text-violet-300">{coins(e.credited_total)}</td><td><StatusBadge status={e.status} /></td><td>{fdate(e.started_at)}</td>
            <td><button className="text-amber-400 text-xs" onClick={() => setView(e)} data-testid={`view-entries-${e.id}`}>Entries</button></td></tr>)}</tbody></table></div> : <Empty title="No plans yet" />}
      </Glass>
      <Entries en={view} onClose={() => setView(null)} />
    </div>
  );
}

function Rewards() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-rewards"], queryFn: () => get("/rewards") });
  const claim = useMutation({ mutationFn: (id) => api.post(`/rewards/${id}/claim`), onSuccess: () => { toast.success("Claim submitted for review"); qc.invalidateQueries({ queryKey: ["my-rewards"] }); }, onError: (e) => toast.error(errMsg(e)) });
  if (isLoading) return <Loader />;
  return (
    <div data-testid="rewards-page">
      <PageHeader title="Rewards & achievements" subtitle="Rewards are subject to campaign terms, eligibility review and availability. They are not guaranteed." />
      <Glass className="mb-5"><p className="text-sm text-slate-400">Your team volume</p><p className="font-num text-3xl text-white" data-testid="team-volume">{coins(data.team_volume, 0)}</p></Glass>
      <div className="grid md:grid-cols-2 gap-5">
        {data.rewards.map((r) => (
          <Glass key={r.id} className="flex gap-4" data-testid={`my-reward-${r.slug}`}>
            <img src={r.image_url} alt={r.title} className="w-28 h-28 rounded-xl object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <Link to={`/rewards/${r.slug}`} className="font-heading text-lg text-white hover:text-amber-300">{r.title}</Link>
              <p className="text-xs text-slate-500">Milestone {coins(r.milestone, 0)}</p>
              <Progress value={r.progress_pct} className="h-2 my-3" /><p className="text-xs text-slate-400">{r.progress_pct}% complete</p>
              <div className="mt-3 flex items-center gap-2">
                {r.claim ? <StatusBadge status={r.claim.status} testid={`claim-status-${r.slug}`} /> : <button className="btn-gold !py-1.5 !text-sm" disabled={!r.eligible || claim.isPending} onClick={() => claim.mutate(r.id)} data-testid={`claim-btn-${r.slug}`}>{r.eligible ? "Submit claim" : "Not yet eligible"}</button>}
              </div>
            </div>
          </Glass>
        ))}
      </div>
    </div>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [reason, setReason] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["notifications", page], queryFn: () => get("/notifications", { page, size: 15 }) });
  const refresh = () => ["notifications", "unread"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = (n, path) => api.post(`/notifications/${n.id}/${path}`).then(refresh);
  const send = async () => {
    try { await api.post(`/notifications/${report.id}/report`, { reason }); toast.success("Reported to moderators"); setReport(null); setReason(""); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div data-testid="notifications-page">
      <PageHeader title="Notifications" subtitle="Your in-app inbox. Links are checked and external destinations are previewed before opening."
        actions={<button className="btn-ghost" onClick={() => api.post("/notifications/read-all").then(refresh)} data-testid="mark-all-read-btn"><CheckCheck className="w-4 h-4" />Mark all read</button>} />
      {isLoading ? <Loader /> : data.items.length ? (
        <div className="space-y-3">
          {data.items.map((n) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`glass p-4 flex gap-4 ${!n.read ? "!border-amber-500/40" : ""}`} data-testid={`notification-${n.id}`}>
              {n.image_url && <img src={n.image_url} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-white">{n.title}</p><span className="text-[10px] uppercase text-slate-500">{n.kind}{n.sender_name ? ` · from ${n.sender_name}` : ""}</span>{!n.read && <span className="w-2 h-2 rounded-full bg-amber-400" />}</div>
                <div className="text-sm text-slate-300 mt-1"><LinkText text={n.message} onLink={() => act(n, "click")} /></div>
                {n.link && <button className="text-xs text-amber-400 mt-2 underline" onClick={() => { act(n, "click"); n.link.startsWith("/") ? window.location.assign(n.link) : window.open(n.link, "_blank", "noopener,noreferrer"); }} data-testid={`notification-cta-${n.id}`}>{n.cta_label || "Open link"}</button>}
                <p className="text-xs text-slate-500 mt-2">{fdate(n.created_at)}</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {!n.read && <button className="text-xs text-slate-400 hover:text-white" onClick={() => act(n, "read")} data-testid={`mark-read-${n.id}`}>Mark read</button>}
                {n.kind === "team" && <button className="text-xs text-red-300 flex items-center gap-1" onClick={() => setReport(n)} data-testid={`report-${n.id}`}><Flag className="w-3 h-3" />Report</button>}
              </div>
            </motion.div>
          ))}
          <Pager page={page} size={15} total={data.total} onPage={setPage} />
        </div>
      ) : <Empty title="No notifications" />}
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20"><DialogHeader><DialogTitle>Report team announcement</DialogTitle></DialogHeader>
          <Textarea className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reporting this message?" data-testid="report-reason-input" />
          <button className="btn-gold" disabled={reason.length < 3} onClick={send} data-testid="report-submit-btn">Submit report</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Ticket({ id, onClose }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const { data } = useQuery({ queryKey: ["ticket", id], queryFn: () => get(`/tickets/${id}`), enabled: !!id });
  const reply = useMutation({ mutationFn: () => api.post(`/tickets/${id}/reply`, { message: msg }), onSuccess: () => { setMsg(""); qc.invalidateQueries({ queryKey: ["ticket", id] }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-xl max-h-[85vh] overflow-y-auto" data-testid="ticket-dialog">
        <DialogHeader><DialogTitle>{data?.subject}</DialogTitle></DialogHeader>
        <div className="space-y-3">{data?.replies.map((r) => (
          <div key={r.id} className={`rounded-xl p-3 text-sm ${r.author_role === "admin" ? "bg-blue-500/10 border border-blue-500/30" : "bg-slate-900 border border-slate-800"}`}>
            <p className="text-[11px] text-slate-500 mb-1">{r.author_role === "admin" ? "Support team" : "You"} · {fdate(r.created_at)}</p><p className="whitespace-pre-wrap">{r.message}</p></div>
        ))}</div>
        {data?.status !== "closed" && <div className="space-y-2"><Textarea className="inp" value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="ticket-reply-input" />
          <button className="btn-gold" disabled={!msg || reply.isPending} onClick={() => reply.mutate()} data-testid="ticket-reply-btn">Send reply</button></div>}
      </DialogContent>
    </Dialog>
  );
}

function Support() {
  const qc = useQueryClient();
  const [f, setF] = useState({ subject: "", category: "deposit", message: "" });
  const [open, setOpen] = useState(null);
  const list = useQuery({ queryKey: ["tickets"], queryFn: () => get("/tickets") });
  const create = useMutation({ mutationFn: () => api.post("/tickets", f), onSuccess: () => { toast.success("Ticket created"); setF({ subject: "", category: "deposit", message: "" }); qc.invalidateQueries({ queryKey: ["tickets"] }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div data-testid="support-page">
      <PageHeader title="Support" subtitle="Open a ticket, or reach the payment support team on Telegram." />
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5">
        <div className="space-y-4">
          <TelegramButton />
          <Glass className="space-y-3">
            <h3 className="font-semibold text-white">New support ticket</h3>
            <Field label="Subject"><Input className="inp" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="ticket-subject-input" /></Field>
            <Field label="Category"><select className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="ticket-category-select">
              {["deposit", "withdrawal", "account", "team", "rewards", "other"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Message"><Textarea className="inp min-h-[120px]" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="ticket-message-input" /></Field>
            <button className="btn-gold w-full" disabled={create.isPending || f.subject.length < 3 || f.message.length < 5} onClick={() => create.mutate()} data-testid="ticket-submit-btn">Submit ticket</button>
          </Glass>
        </div>
        <Glass data-testid="tickets-list">
          <h3 className="font-semibold text-white mb-3">My tickets</h3>
          {list.isLoading ? <Loader /> : list.data?.length ? list.data.map((t) => (
            <button key={t.id} onClick={() => setOpen(t.id)} className="w-full text-left flex items-center justify-between gap-3 py-3 border-b border-slate-800 hover:bg-slate-900/40 px-2 rounded" data-testid={`ticket-${t.id}`}>
              <div><p className="text-white text-sm">{t.subject}</p><p className="text-xs text-slate-500">{t.category} · {fdate(t.updated_at)}</p></div><StatusBadge status={t.status} /></button>
          )) : <Empty title="No tickets yet" />}
        </Glass>
      </div>
      <Ticket id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function TwoFA({ user, refresh }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); setSetup(null); setCode(""); refresh(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Glass className="space-y-3" data-testid="twofa-card">
      <div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" /><h3 className="font-semibold text-white">Two-factor authentication</h3>{user.totp_enabled && <StatusBadge status="active" testid="twofa-status" />}</div>
      {user.totp_enabled ? (<>
        <Input className="inp" type="password" placeholder="Current password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="twofa-disable-password" />
        <Input className="inp font-num" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="twofa-disable-code" />
        <button className="btn-ghost" onClick={() => run(() => api.post("/auth/2fa/disable", { code, password: pw }), "2FA disabled")} data-testid="twofa-disable-btn">Disable 2FA</button>
      </>) : setup ? (<>
        <div className="bg-white p-3 rounded-xl w-fit"><QRCodeSVG value={setup.otpauth_uri} size={150} /></div>
        <p className="text-xs text-slate-400">Scan with an authenticator app or enter: <span className="font-num text-slate-200 break-all" data-testid="twofa-secret">{setup.secret}</span></p>
        <Input className="inp font-num" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} data-testid="twofa-enable-code" />
        <button className="btn-gold" onClick={() => run(() => api.post("/auth/2fa/enable", { code }), "2FA enabled")} data-testid="twofa-enable-btn">Verify & enable</button>
      </>) : <button className="btn-gold" onClick={async () => setSetup((await api.post("/auth/2fa/setup")).data)} data-testid="twofa-setup-btn">Set up 2FA</button>}
    </Glass>
  );
}

function MobileVerify({ user, refresh }) {
  const [demo, setDemo] = useState(null);
  const [code, setCode] = useState("");
  if (user.mobile_verified) return <p className="text-sm text-emerald-300 flex items-center gap-2" data-testid="mobile-verified"><Smartphone className="w-4 h-4" />Mobile {user.country_code} {user.mobile} verified</p>;
  return (
    <div className="space-y-2" data-testid="mobile-verify">
      <p className="text-sm text-slate-300">Mobile {user.country_code} {user.mobile} is not verified.</p>
      <button className="btn-ghost" onClick={async () => { try { setDemo((await api.post("/auth/mobile/send-otp")).data.demo_code); } catch (e) { toast.error(errMsg(e)); } }} data-testid="send-otp-btn">Send code</button>
      {demo && <><p className="text-xs text-violet-300" data-testid="demo-otp">MOCKED SMS — demo code: <span className="font-num">{demo}</span></p>
        <div className="flex gap-2"><Input className="inp font-num" value={code} onChange={(e) => setCode(e.target.value)} data-testid="otp-input" />
          <button className="btn-gold" onClick={async () => { try { await api.post("/auth/mobile/verify", { code }); toast.success("Mobile verified"); refresh(); } catch (e) { toast.error(errMsg(e)); } }} data-testid="verify-otp-btn">Verify</button></div></>}
    </div>
  );
}

function Sessions() {
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data = [] } = useQuery({ queryKey: ["sessions"], queryFn: () => get("/auth/sessions") });
  return (
    <Glass data-testid="sessions-card">
      <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-white flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-amber-400" />Active sessions</h3>
        <Confirm testid="logout-all" title="Sign out of all devices?" description="Every active session, including this one, will be ended." onConfirm={() => logout(true)} trigger={<button className="btn-ghost !py-1.5 text-sm" data-testid="logout-all-btn">Logout all devices</button>} /></div>
      {data.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-t border-slate-800 text-sm">
          <div className="min-w-0"><p className="truncate text-slate-200">{s.user_agent || "Unknown device"}</p><p className="text-xs text-slate-500">{s.ip} · {fdate(s.created_at)} {s.current && <span className="text-emerald-400">· this device</span>}</p></div>
          {!s.current && <button className="text-xs text-red-300" onClick={() => api.delete(`/auth/sessions/${s.id}`).then(() => qc.invalidateQueries({ queryKey: ["sessions"] }))} data-testid={`revoke-session-${s.id}`}>Revoke</button>}
        </div>
      ))}
    </Glass>
  );
}

function Profile() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user.full_name);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const save = async (body, ok) => { setBusy(true); try { await api.put("/profile", body); await refresh(); toast.success(ok); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  const perm = permission();
  const togglePush = async (on) => { try { on ? await enablePush() : await disablePush(); toast.success(on ? "Push enabled" : "Push disabled on this device"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div data-testid="profile-page">
      <PageHeader title="Profile & security" />
      <div className="grid lg:grid-cols-2 gap-5">
        <Glass className="space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-white">Profile</h3><RankBadge rank={user.rank} /></div>
          <Field label="Full name"><Input className="inp" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" /></Field>
          <p className="text-sm text-slate-400">Email: <span className="text-slate-200">{user.email}</span></p>
          <p className="text-sm text-slate-400">Referral code: <span className="font-num text-amber-300" data-testid="profile-referral-code">{user.referral_code}</span></p>
          <button className="btn-gold" disabled={busy} onClick={() => save({ full_name: name }, "Profile saved")} data-testid="profile-save-btn">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save profile</button>
          <div className="border-t border-slate-800 pt-4 space-y-3"><h4 className="text-sm font-semibold text-white">Verification</h4>
            <div className="flex items-center gap-3 text-sm">Account verification: <StatusBadge status={user.kyc_status} testid="kyc-status" />
              {["not_submitted", "rejected"].includes(user.kyc_status) && <button className="btn-ghost !py-1 text-xs" onClick={async () => { try { await api.post("/profile/kyc"); await refresh(); toast.success("Submitted for review"); } catch (e) { toast.error(errMsg(e)); } }} data-testid="kyc-submit-btn">Submit for review</button>}</div>
          </div>
        </Glass>
        <Glass className="space-y-4" data-testid="prefs-card">
          <h3 className="font-semibold text-white">Communication preferences</h3>
          {[["allow_team_messages", "Receive team announcements from my upline"], ["marketing_push", "Receive broadcast push notifications"], ["push_reminders", "Remind me to enable notifications"]].map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm text-slate-300">{l}<Switch checked={!!user.prefs?.[k]} onCheckedChange={(v) => save({ prefs: { [k]: v } }, "Preferences saved")} data-testid={`pref-${k}`} /></label>
          ))}
          <div className="border-t border-slate-800 pt-4 text-sm space-y-2"><p className="text-slate-400">Browser permission: <span className="text-white" data-testid="push-permission-state">{perm}</span></p>
            <div className="flex gap-2"><button className="btn-gold !py-1.5" onClick={() => togglePush(true)} disabled={perm === "denied" || perm === "unsupported"} data-testid="push-enable-profile-btn">Enable push on this device</button>
              <button className="btn-ghost !py-1.5" onClick={() => togglePush(false)} data-testid="push-disable-btn">Disable</button></div>
            {perm === "denied" && <p className="text-xs text-red-300">Blocked by your browser. Allow notifications in site settings, then reload.</p>}</div>
        </Glass>
        <TwoFA user={user} refresh={refresh} />
        <Glass className="space-y-3">
          <h3 className="font-semibold text-white">Change password</h3>
          <PasswordInput placeholder="Current password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} testid="current-password-input" />
          <PasswordInput placeholder="New password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} testid="new-password-input" />
          <button className="btn-gold" onClick={async () => { try { await api.post("/auth/change-password", pw); toast.success("Password changed; other sessions signed out"); setPw({ current_password: "", new_password: "" }); } catch (e) { toast.error(errMsg(e)); } }} data-testid="change-password-btn">Update password</button>
        </Glass>
        <div className="lg:col-span-2"><Sessions /></div>
      </div>
    </div>
  );
}

const PAGES = { overview: Overview, plans: Plans, rewards: Rewards, notifications: Notifications, support: Support, profile: Profile };
export default function UserPages({ page }) {
  const P = PAGES[page];
  return <P />;
}
