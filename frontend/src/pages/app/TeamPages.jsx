import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ChevronRight, Download, Search, Share2, Sparkles, Calculator, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { api, coins, errMsg, fdate, downloadCsv } from "@/lib/api";
import { Glass, PageHeader, Stat, Loader, Empty, ErrorBox, StatusBadge, Field, Pager, RankBadge, ImageUpload, DemoTag } from "@/components/common";
import { TT, ChartCard } from "@/pages/app/UserPages";
import { ReferPlanButton } from "@/components/ReferPlan";


const get = (url, params) => api.get(url, { params }).then((r) => r.data);
const RANKS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];

function flatten(root, open) {
  const out = [];
  const stack = [[root, 0]];
  while (stack.length) {
    const [n, d] = stack.pop();
    out.push([n, d]);
    if (open.has(n.id)) for (let i = (n.children || []).length - 1; i >= 0; i--) stack.push([n.children[i], d + 1]);
  }
  return out;
}

function TreeView({ root }) {
  const [open, setOpen] = useState(() => new Set([root.id]));
  const toggle = (id) => setOpen((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  return <div>{flatten(root, open).map(([n, d]) => <TreeRow key={n.id} n={n} depth={d} open={open.has(n.id)} onToggle={() => toggle(n.id)} />)}</div>;
}

function TreeRow({ n, depth, open, onToggle }) {
  const has = n.children?.length > 0;
  return (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} style={{ marginLeft: depth * 20 }} className={depth ? "border-l border-slate-800 pl-3" : ""}>
      <button onClick={onToggle} className="flex items-center gap-2 py-1.5 w-full text-left hover:bg-slate-900/50 rounded-lg px-2" data-testid={`tree-node-${n.id}`}>
        <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? "rotate-90" : ""} ${has ? "" : "opacity-0"}`} />
        <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-slate-950" style={{ background: ["#F59E0B", "#3B82F6", "#8B5CF6", "#10B981", "#EC4899", "#06B6D4"][n.generation] }}>{n.generation || "★"}</span>
        <span className="text-sm text-slate-200 truncate">{n.name}</span><RankBadge rank={n.rank} />
        {has && <span className="text-xs text-slate-500 ml-auto">{n.children.length}</span>}
      </button>
    </motion.div>
  );
}

function Summary({ s }) {
  const [anim, setAnim] = useState(true);
  const link = `${window.location.origin}/r/${s.referral_code}`;
  const msg = encodeURIComponent(`Join me on Finzo.cc — sign up with my referral link: ${link}`);
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success("Referral link copied"); } catch { toast.error("Copy failed — long-press the link to copy"); } };
  const share = () => (navigator.share ? navigator.share({ title: "Join Finzo.cc", text: "Sign up with my referral link", url: link }).catch(() => {}) : copy());
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Direct referrals" value={s.direct} testid="team-direct" /><Stat label="Indirect referrals" value={s.indirect} tone="blue" testid="team-indirect" />
        <Stat label="Total team (5 gens)" value={s.team} tone="violet" testid="team-total" />
        <motion.div initial={anim ? { scale: 0.9, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} onAnimationComplete={() => setAnim(false)} className="glass p-5 border-amber-500/40" data-testid="team-rank-card">
          <p className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-400" />Current rank</p><div className="mt-3"><RankBadge rank={s.rank} testid="team-rank" /></div>
        </motion.div>
      </div>
      <Glass className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1 min-w-0"><p className="text-sm text-slate-400">Your referral link · code <span className="font-num text-white" data-testid="referral-code">{s.referral_code}</span></p><p className="font-num text-amber-200 text-sm break-all" data-testid="referral-link">{link}</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost !py-2" onClick={copy} data-testid="copy-referral-btn"><Share2 className="w-4 h-4" />Copy</button>
          <a className="btn-ghost !py-2" href={`https://wa.me/?text=${msg}`} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp-btn">WhatsApp</a>
          <a className="btn-ghost !py-2" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on Finzo.cc")}`} target="_blank" rel="noopener noreferrer" data-testid="share-telegram-btn">Telegram</a>
          <button className="btn-gold !py-2" onClick={share} data-testid="share-native-btn">Share</button>
        </div>
      </Glass>
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Generation structure" testid="chart-generations"><ResponsiveContainer><BarChart data={s.generations.map((v, i) => ({ g: `Gen ${i + 1}`, v }))}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="g" stroke="#64748b" fontSize={11} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Bar dataKey="v" name="Members" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
        </BarChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Team growth over time" testid="chart-team-growth">{s.growth.length ? <ResponsiveContainer><AreaChart data={s.growth}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="date" stroke="#64748b" fontSize={11} /><YAxis allowDecimals={false} stroke="#64748b" fontSize={11} /><Tooltip {...TT} /><Area dataKey="total" stroke="#10B981" fill="#10B98133" />
        </AreaChart></ResponsiveContainer> : <Empty title="No team members yet" />}</ChartCard>
      </div>
      <Glass data-testid="rank-progress">
        <h3 className="font-semibold text-white mb-4">Rank qualification progress {s.next_rank && <span className="text-sm text-slate-400 font-normal">· next: {s.next_rank.name}</span>}</h3>
        <div className="space-y-4">{s.progress.map((p) => (
          <div key={p.name} className="grid sm:grid-cols-[110px_1fr_1fr_80px] gap-3 items-center" data-testid={`rank-row-${p.name}`}>
            <RankBadge rank={p.name} />
            <div><p className="text-xs text-slate-500">Direct {s.direct}/{p.min_direct}</p><Progress value={p.direct_pct} className="h-1.5" /></div>
            <div><p className="text-xs text-slate-500">Team {s.team}/{p.min_team}</p><Progress value={p.team_pct} className="h-1.5" /></div>
            <span className={`text-xs font-semibold ${p.qualified ? "text-emerald-400" : "text-slate-500"}`}>{p.qualified ? "Qualified" : "Not yet"}</span>
          </div>
        ))}</div>
      </Glass>
      <Glass><h3 className="font-semibold text-white mb-3">Rank history</h3>
        {s.history.length ? s.history.map((h) => <p key={h.id} className="text-sm text-slate-300 py-1.5 border-b border-slate-800">{fdate(h.created_at)} — {h.from} → <span className="text-amber-300">{h.to}</span> <span className="text-xs text-slate-500">(direct {h.direct}, team {h.team})</span></p>) : <Empty title="No rank changes yet" />}
      </Glass>
    </div>
  );
}

function Members() {
  const [f, setF] = useState({ q: "", generation: "", rank: "", page: 1 });
  const { data, isLoading } = useQuery({ queryKey: ["team-members", f], queryFn: () => get("/team/members", { ...f, generation: f.generation || undefined, rank: f.rank || undefined, size: 15 }) });
  const sel = "bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-sm h-10";
  return (
    <Glass>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" /><Input className="inp pl-9" placeholder="Search by name" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} data-testid="team-search-input" /></div>
        <select className={sel} value={f.generation} onChange={(e) => setF({ ...f, generation: e.target.value, page: 1 })} data-testid="team-gen-filter"><option value="">All generations</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{`Generation ${g}`}</option>)}</select>
        <select className={sel} value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value, page: 1 })} data-testid="team-rank-filter"><option value="">All ranks</option>{["Member", ...RANKS].map((r) => <option key={r}>{r}</option>)}</select>
        <button className="btn-ghost" onClick={() => downloadCsv("/team/export", "team.csv").catch((e) => toast.error(errMsg(e)))} data-testid="team-export-btn"><Download className="w-4 h-4" />Export</button>
      </div>
      {isLoading ? <Loader /> : data.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="team-table"><thead><tr><th>Name</th><th>Generation</th><th>Rank</th><th>Joined</th><th>Activity</th></tr></thead>
        <tbody>{data.items.map((m) => <tr key={m.id}><td>{m.name}</td><td className="font-num">{m.generation}</td><td><RankBadge rank={m.rank} /></td><td>{m.joined}</td><td><StatusBadge status={m.activity} /></td></tr>)}</tbody></table></div> : <Empty title="No members match" />}
      {data && <Pager page={f.page} size={15} total={data.total} onPage={(p) => setF({ ...f, page: p })} />}
      <p className="text-xs text-slate-500 mt-3">Privacy: names beyond generation 1 are masked. Activity shows whether a member was active in the last 7 days. Contact details, deposits, balances and login history of team members are never shown.</p>
    </Glass>
  );
}

function CommissionSim() {
  const [amount, setAmount] = useState(10000);
  const [ranks, setRanks] = useState(["Diamond", "Platinum", "Gold", "Silver", "Bronze"]);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const run = async () => { setErr(null); try { setRes((await api.post("/team/commission-sim", { amount: Number(amount), ancestor_ranks: ranks })).data); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5" data-testid="commission-sim">
      <Glass className="space-y-3">
        <div className="flex items-center gap-2"><Calculator className="w-4 h-4 text-amber-400" /><h3 className="font-semibold text-white">Five-generation commission calculator</h3></div>
        <p className="text-xs text-slate-400">Model one example amount and the rank of each ancestor above the member. Educational calculator — no commissions are paid on this platform.</p>
        <Field label="Example amount"><Input className="inp font-num" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="sim-amount-input" /></Field>
        {ranks.map((r, i) => (
          <Field key={i} label={`Tier ${i + 1} ancestor rank`}><select className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-sm" value={r} data-testid={`sim-tier-${i + 1}`} onChange={(e) => setRanks(ranks.map((x, j) => (j === i ? e.target.value : x)))}>
            <option value="Member">Member (not qualified)</option>{RANKS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        ))}
        <ErrorBox error={err} />
        <button className="btn-gold w-full" onClick={run} data-testid="sim-run-btn">Calculate obligations</button>
      </Glass>
      <Glass>
        {res ? (<div data-testid="sim-result">
          <table className="tbl"><thead><tr><th>Tier</th><th>Rank</th><th>Rate</th><th className="text-right">Obligation</th></tr></thead>
            <tbody>{res.tiers.map((t) => <tr key={t.tier}><td>T{t.tier}</td><td><RankBadge rank={t.rank} /></td><td className="font-num">{t.rate_percent.toFixed(2)}%</td><td className="text-right font-num">{coins(t.obligation)}</td></tr>)}</tbody></table>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Stat label="Total overlapping obligation" value={coins(res.total_obligation)} tone="violet" testid="sim-total" />
            <Stat label="Share of deposit" value={`${res.obligation_percent}%`} testid="sim-percent" />
          </div>
          <p className="text-xs text-amber-200/90 mt-4 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{res.note}</p>
        </div>) : <Empty title="Run the calculator" text="See how each qualifying ancestor's percentage stacks on the same deposit." />}
      </Glass>
    </div>
  );
}

function Team() {
  const s = useQuery({ queryKey: ["team-summary"], queryFn: () => get("/team/summary") });
  const tree = useQuery({ queryKey: ["team-tree"], queryFn: () => get("/team/tree") });
  if (s.isLoading) return <Loader />;
  if (s.error) return <ErrorBox error={errMsg(s.error)} />;
  return (
    <div data-testid="team-page">
      <div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="My team network" subtitle="Five-generation referral structure, rank qualification and the commission calculator." /><ReferPlanButton /></div>
      <Tabs defaultValue="summary">
        <TabsList className="bg-slate-900 flex-wrap h-auto mb-5">
          <TabsTrigger value="summary" data-testid="team-tab-summary">Summary & ranks</TabsTrigger><TabsTrigger value="tree" data-testid="team-tab-tree">Tree view</TabsTrigger>
          <TabsTrigger value="table" data-testid="team-tab-table">Table view</TabsTrigger><TabsTrigger value="sim" data-testid="team-tab-sim">Commission calculator</TabsTrigger>
        </TabsList>
        <TabsContent value="summary"><Summary s={s.data} /></TabsContent>
        <TabsContent value="tree"><Glass data-testid="team-tree">{tree.isLoading ? <Loader /> : tree.data.count ? <TreeView root={tree.data.root} /> : <Empty title="No team members yet" text="Share your referral link to start your network." />}</Glass></TabsContent>
        <TabsContent value="table"><Members /></TabsContent>
        <TabsContent value="sim"><CommissionSim /></TabsContent>
      </Tabs>
    </div>
  );
}

function Announcements() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ["team-members-all"], queryFn: () => get("/team/members", { size: 100 }) });
  const sent = useQuery({ queryKey: ["team-sent"], queryFn: () => get("/team-messages/sent") });
  const [f, setF] = useState({ scope: "team", recipient_ids: [], title: "", message: "", link: "" });
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(null);
  const mut = useMutation({
    mutationFn: () => api.post("/team-messages", { ...f, link: f.link || null, image_public_id: img?.public_id || null }),
    onSuccess: (r) => { toast.success(`Delivered to ${r.data.delivered} consenting member(s)`); setF({ ...f, title: "", message: "", link: "" }); setImg(null); setErr(null); qc.invalidateQueries({ queryKey: ["team-sent"] }); },
    onError: (e) => setErr(errMsg(e)),
  });
  const toggle = (id) => setF({ ...f, recipient_ids: f.scope === "individual" ? [id] : f.recipient_ids.includes(id) ? f.recipient_ids.filter((x) => x !== id) : [...f.recipient_ids, id] });
  return (
    <div data-testid="announcements-page">
      <PageHeader title="Team announcements" subtitle="Message your own downline. Only members who allow team messages receive them. Rate limited; misuse can be reported to moderators." />
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
        <Glass className="space-y-3">
          <Tabs value={f.scope} onValueChange={(v) => setF({ ...f, scope: v, recipient_ids: [] })}><TabsList className="bg-slate-900">
            <TabsTrigger value="team" data-testid="scope-team">Whole team</TabsTrigger><TabsTrigger value="selected" data-testid="scope-selected">Selected</TabsTrigger><TabsTrigger value="individual" data-testid="scope-individual">Individual</TabsTrigger></TabsList></Tabs>
          {f.scope !== "team" && <div className="max-h-44 overflow-y-auto border border-slate-800 rounded-xl p-2" data-testid="recipient-list">
            {members.data?.items.length ? members.data.items.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-slate-900 rounded">
              <input type={f.scope === "individual" ? "radio" : "checkbox"} checked={f.recipient_ids.includes(m.id)} onChange={() => toggle(m.id)} className="accent-amber-500" data-testid={`recipient-${m.id}`} />{m.name} <span className="text-xs text-slate-500">Gen {m.generation}</span></label>) : <Empty title="No team members" />}</div>}
          <Field label="Title"><Input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="tm-title-input" /></Field>
          <Field label="Message" hint="URLs such as www.example.com become safe clickable links."><Textarea className="inp min-h-[110px]" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="tm-message-input" /></Field>
          <Field label="Optional link"><Input className="inp" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" data-testid="tm-link-input" /></Field>
          <ImageUpload sigPath="/uploads/signature" sigBody={{ purpose: "announcement" }} onUploaded={setImg} testid="tm-image" label="Optional image" />
          <ErrorBox error={err} />
          <button className="btn-gold w-full" disabled={mut.isPending || f.title.length < 2 || f.message.length < 2} onClick={() => mut.mutate()} data-testid="tm-send-btn">Send announcement</button>
        </Glass>
        <Glass data-testid="tm-history"><h3 className="font-semibold text-white mb-3">Message history</h3>
          {sent.data?.length ? sent.data.map((m) => (
            <div key={m.id} className="py-3 border-b border-slate-800 text-sm"><div className="flex justify-between gap-2"><p className="text-white">{m.title}</p><StatusBadge status={m.status} /></div>
              <p className="text-xs text-slate-500 mt-1">{fdate(m.created_at)} · {m.scope} · delivered {m.delivered}/{m.targeted}{m.skipped_no_consent ? ` · ${m.skipped_no_consent} opted out` : ""}</p></div>
          )) : <Empty title="No announcements sent" />}
        </Glass>
      </div>
    </div>
  );
}

const PAGES = { team: Team, announcements: Announcements };
export default function TeamPages({ page }) {
  const P = PAGES[page];
  return <P />;
}
