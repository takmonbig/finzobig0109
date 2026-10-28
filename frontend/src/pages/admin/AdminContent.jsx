import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Play, Send, Ban, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api, coins, errMsg, fdate } from "@/lib/api";
import { Glass, PageHeader, Loader, Empty, ErrorBox, StatusBadge, Field, ImageUpload, LinkText, DemoTag, PasswordInput } from "@/components/common";

function MyPassword() {
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/auth/change-password", pw); toast.success("Your password was changed. Other devices were signed out."); setPw({ current_password: "", new_password: "" }); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Glass className="mb-5" data-testid="admin-my-password"><h3 className="font-semibold text-white mb-3">Change my password</h3>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <PasswordInput placeholder="Current password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} testid="admin-current-password" />
        <PasswordInput placeholder="New password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} testid="admin-new-password" />
        <button className="btn-gold" disabled={busy || !pw.current_password || pw.new_password.length < 8} onClick={save} data-testid="admin-change-password-btn">Update</button></div></Glass>
  );
}
import { get, sel } from "@/pages/admin/AdminCore";

const useSave = (key, ok) => {
  const qc = useQueryClient();
  return (fn) => fn.then(() => { toast.success(ok); qc.invalidateQueries({ queryKey: [key] }); return true; }).catch((e) => { toast.error(errMsg(e)); return false; });
};

function Plans() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-plans"], queryFn: () => get("/admin/plans") });
  const [edit, setEdit] = useState(null);
  const save = useSave("admin-plans", "Plan saved");
  const submit = async () => {
    const body = { ...edit, deposit: Number(edit.deposit), daily: Number(edit.daily), duration_days: Number(edit.duration_days) };
    if (await save(edit.id ? api.put(`/admin/plans/${edit.id}`, body) : api.post("/admin/plans", body))) setEdit(null);
  };
  return (
    <div data-testid="admin-plans-page">
      <PageHeader title="Participation plans" subtitle="Editing a plan archives the current version and creates a new one. Existing enrollments keep their original terms."
        actions={<><button className="btn-ghost" onClick={() => save(api.post("/admin/simulation/run"))} data-testid="run-simulation-btn"><Play className="w-4 h-4" />Run daily plan engine now</button>
          <button className="btn-gold" onClick={() => setEdit({ name: "", description: "", deposit: 100, daily: 5, duration_days: 30, payout_schedule: "daily", active: true })} data-testid="add-plan-btn"><Plus className="w-4 h-4" />Add plan</button></>} />
      <Glass>{isLoading ? <Loader /> : <div className="overflow-x-auto"><table className="tbl" data-testid="admin-plans-table"><thead><tr><th>Name</th><th>Ver.</th><th>Deposit</th><th>Daily</th><th>Days</th><th>Total</th><th>Schedule</th><th>Status</th><th /></tr></thead>
        <tbody>{data.map((p) => <tr key={p.id} className={p.archived ? "opacity-50" : ""}><td className="text-white">{p.name}</td><td className="font-num">v{p.version}</td><td className="font-num">{coins(p.deposit)}</td><td className="font-num">{coins(p.daily)}</td><td className="font-num">{p.duration_days}</td><td className="font-num">{coins(p.total_payout)}</td><td>{p.payout_schedule}</td>
          <td><StatusBadge status={p.archived ? "closed" : p.active ? "active" : "disabled"} /></td>
          <td className="whitespace-nowrap space-x-2">{!p.archived && <><button className="text-xs text-amber-300" onClick={() => setEdit({ ...p, deposit: p.deposit / 100, daily: p.daily / 100 })} data-testid={`edit-plan-${p.id}`}>Edit</button>
            <button className="text-xs text-slate-300" onClick={() => save(api.post(`/admin/plans/${p.id}/toggle`))} data-testid={`toggle-plan-${p.id}`}>{p.active ? "Deactivate" : "Activate"}</button></>}</td></tr>)}</tbody></table></div>}</Glass>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20" data-testid="plan-dialog"><DialogHeader><DialogTitle>{edit?.id ? "New version of plan" : "Add plan"}</DialogTitle></DialogHeader>
          {edit && <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Name"><Input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="plan-name-input" /></Field></div>
            <div className="col-span-2"><Field label="Description"><Textarea className="inp" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} data-testid="plan-desc-input" /></Field></div>
            {[["deposit", "Plan amount (coins)"], ["daily", "Daily amount (coins)"], ["duration_days", "Duration (days)"]].map(([k, l]) => <Field key={k} label={l}><Input className="inp font-num" type="number" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} data-testid={`plan-${k}-input`} /></Field>)}
            <Field label="Payout schedule"><select className={sel + " w-full"} value={edit.payout_schedule} onChange={(e) => setEdit({ ...edit, payout_schedule: e.target.value })} data-testid="plan-schedule-select"><option value="daily">daily</option><option value="weekly">weekly</option><option value="end_of_term">end_of_term</option></select></Field>
            <label className="flex items-center gap-2 text-sm">Active <Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
          </div>}
          <button className="btn-gold" onClick={submit} data-testid="plan-save-btn">Save</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const lines = (a) => (a || []).join("\n");
const unlines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Rewards() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-rewards"], queryFn: () => get("/admin/rewards") });
  const claims = useQuery({ queryKey: ["admin-claims"], queryFn: () => get("/admin/reward-claims") });
  const [edit, setEdit] = useState(null);
  const [note, setNote] = useState("");
  const save = useSave("admin-rewards", "Reward saved");
  const saveClaim = useSave("admin-claims", "Claim updated");
  const submit = async () => {
    const b = { ...edit, milestone: Number(edit.milestone), inventory: Number(edit.inventory), qualification_rules: unlines(edit._rules), eligibility: unlines(edit._elig), terms: unlines(edit._terms), redemption: unlines(edit._red), expires_at: edit.expires_at || null };
    ["_rules", "_elig", "_terms", "_red", "id", "created_at", "updated_at", "concept"].forEach((k) => delete b[k]);
    if (await save(edit.id ? api.put(`/admin/rewards/${edit.id}`, b) : api.post("/admin/rewards", b))) setEdit(null);
  };
  const open = (r) => setEdit(r ? { ...r, milestone: r.milestone / 100, _rules: lines(r.qualification_rules), _elig: lines(r.eligibility), _terms: lines(r.terms), _red: lines(r.redemption) }
    : { title: "", slug: "", category: "", description: "", milestone: 100000, inventory: 1, faqs: [], image_url: "", active: true, _rules: "", _elig: "", _terms: "", _red: "" });
  return (
    <div data-testid="admin-rewards-page">
      <PageHeader title="Rewards & claims" subtitle="Set milestones, inventory and terms. Rewards must be shown as subject to eligibility and availability." actions={<button className="btn-gold" onClick={() => open(null)} data-testid="add-reward-btn"><Plus className="w-4 h-4" />Add reward</button>} />
      <Tabs defaultValue="rewards"><TabsList className="bg-slate-900 mb-4"><TabsTrigger value="rewards" data-testid="rw-tab-rewards">Rewards</TabsTrigger><TabsTrigger value="claims" data-testid="rw-tab-claims">Claims ({claims.data?.length || 0})</TabsTrigger></TabsList>
        <TabsContent value="rewards">{isLoading ? <Loader /> : <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{data.map((r) => (
          <Glass key={r.id} className="!p-0 overflow-hidden" data-testid={`admin-reward-${r.slug}`}><img src={r.image_url} alt={r.title} className="w-full h-36 object-cover" />
            <div className="p-4"><p className="text-white font-semibold">{r.title}</p><p className="text-xs text-slate-500">{coins(r.milestone, 0)} · inventory {r.inventory} {r.expires_at && `· expires ${r.expires_at.slice(0, 10)}`}</p>
              <div className="flex items-center justify-between mt-3"><StatusBadge status={r.active ? "active" : "disabled"} /><button className="btn-ghost !py-1 !px-3 text-xs" onClick={() => open(r)} data-testid={`edit-reward-${r.slug}`}><Pencil className="w-3 h-3" />Edit</button></div></div></Glass>
        ))}</div>}</TabsContent>
        <TabsContent value="claims"><Glass>{claims.data?.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="claims-table"><thead><tr><th>Date</th><th>User</th><th>Reward</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{claims.data.map((c) => <tr key={c.id}><td>{fdate(c.created_at)}</td><td>{c.user_email}</td><td>{c.reward_title}</td><td><StatusBadge status={c.status} /></td>
            <td className="flex gap-2 flex-wrap"><Input className="inp !h-8 w-40" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`claim-note-${c.id}`} />
              {(c.status === "pending_review" ? ["approved", "rejected"] : c.status === "approved" ? ["fulfilled"] : []).map((a) => <button key={a} className="btn-ghost !py-1 !px-2 text-xs" disabled={note.length < 3} onClick={() => saveClaim(api.post(`/admin/reward-claims/${c.id}/action`, { action: a, note })).then(() => setNote(""))} data-testid={`claim-${a}-${c.id}`}>{a}</button>)}</td></tr>)}</tbody></table></div> : <Empty title="No claims" />}</Glass></TabsContent>
      </Tabs>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="reward-dialog"><DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} reward</DialogTitle></DialogHeader>
          {edit && <div className="grid sm:grid-cols-2 gap-3">
            {[["title", "Title"], ["slug", "Slug (url)"], ["category", "Category"], ["duration", "Duration (optional)"]].map(([k, l]) => <Field key={k} label={l}><Input className="inp" value={edit[k] || ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} data-testid={`reward-${k}-input`} /></Field>)}
            <Field label="Milestone (team volume)"><Input className="inp font-num" type="number" value={edit.milestone} onChange={(e) => setEdit({ ...edit, milestone: e.target.value })} data-testid="reward-milestone-input" /></Field>
            <Field label="Inventory"><Input className="inp font-num" type="number" value={edit.inventory} onChange={(e) => setEdit({ ...edit, inventory: e.target.value })} data-testid="reward-inventory-input" /></Field>
            <Field label="Expiry date"><Input className="inp" type="date" value={(edit.expires_at || "").slice(0, 10)} onChange={(e) => setEdit({ ...edit, expires_at: e.target.value ? new Date(e.target.value).toISOString() : "" })} data-testid="reward-expiry-input" /></Field>
            <label className="flex items-center gap-2 text-sm">Active <Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
            <div className="sm:col-span-2"><Field label="Description"><Textarea className="inp" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} data-testid="reward-desc-input" /></Field></div>
            {[["_rules", "Qualification rules (one per line)"], ["_elig", "Eligibility (one per line)"], ["_terms", "Terms (one per line)"], ["_red", "Redemption steps (one per line)"]].map(([k, l]) => <Field key={k} label={l}><Textarea className="inp" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}
            <div className="sm:col-span-2"><ImageUpload sigPath="/admin/uploads/signature" sigBody={{ folder: "rewards" }} value={edit.image_url} onUploaded={(r) => setEdit((x) => ({ ...x, image_public_id: r?.public_id || null }))} testid="reward-image-upload" label="Upload reward image" /></div>
          </div>}
          <button className="btn-gold" onClick={submit} data-testid="reward-save-btn">Save reward</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const AUD = [["all", "All users"], ["selected", "Selected users (IDs)"], ["group", "Account group"], ["push_enabled", "With notification permission"], ["push_disabled", "Without notification permission"], ["active_recent", "Recently active"], ["inactive", "Inactive"]];
const CH = [["inbox", "In-app inbox"], ["popup", "Popup announcement"], ["dashboard", "Dashboard banner"], ["push", "Browser push"]];

function Composer({ onDone }) {
  const blank = { title: "", message: "", link: "", cta_label: "", audience: { type: "all" }, channels: ["inbox", "popup"], priority: "normal", scheduled_at: "", expires_at: "" };
  const [f, setF] = useState(blank);
  const [img, setImg] = useState(null);
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const aud = (k, v) => setF({ ...f, audience: { ...f.audience, [k]: v } });
  const toIso = (v) => (v ? new Date(v).toISOString() : null);
  const body = () => ({ ...f, link: f.link || null, cta_label: f.cta_label || null, image_public_id: img?.public_id || null, scheduled_at: toIso(f.scheduled_at), expires_at: toIso(f.expires_at),
    audience: { ...f.audience, user_ids: typeof f.audience.user_ids === "string" ? f.audience.user_ids.split(/[\s,]+/).filter(Boolean) : f.audience.user_ids } });
  const preview = async () => { try { setPrev((await api.post("/admin/campaigns/audience-preview", body().audience)).data); } catch (e) { setErr(errMsg(e)); } };
  const submit = async () => {
    const a = body().audience;
    if ((a.type === "selected" && !a.user_ids?.length) || (a.type === "group" && !a.group)) return setErr("Enter the user IDs or group for this audience");
    setBusy(true); setErr(null);
    try { const r = await api.post("/admin/campaigns", body()); toast.success(r.data.status === "sent" ? `Campaign sent to ${r.data.stats?.eligible ?? 0} recipient(s)` : "Campaign scheduled"); setF(blank); setImg(null); onDone(); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5" data-testid="campaign-composer">
      <Glass className="space-y-3">
        <Field label="Notification title"><Input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="cmp-title-input" /></Field>
        <Field label="Message" hint="URLs (https://docs.google.com/, www.example.com, inv.com) become safe links. HTML is stripped."><Textarea className="inp min-h-[120px]" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="cmp-message-input" /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Destination URL / CTA link"><Input className="inp" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="vv.cc or /app/plans" data-testid="cmp-link-input" /></Field>
          <Field label="CTA button text"><Input className="inp" value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} data-testid="cmp-cta-input" /></Field>
          <Field label="Target audience"><select className={sel + " w-full"} value={f.audience.type} onChange={(e) => setF({ ...f, audience: { type: e.target.value } })} data-testid="cmp-audience-select">{AUD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {f.audience.type === "selected" && <Field label="User IDs (comma separated)"><Input className="inp font-num" onChange={(e) => aud("user_ids", e.target.value)} data-testid="cmp-user-ids-input" /></Field>}
          {f.audience.type === "group" && <Field label="Group name"><Input className="inp" onChange={(e) => aud("group", e.target.value)} data-testid="cmp-group-input" /></Field>}
          {["active_recent", "inactive"].includes(f.audience.type) && <Field label="Days"><Input className="inp font-num" type="number" defaultValue={f.audience.type === "inactive" ? 30 : 7} onChange={(e) => aud("days", Number(e.target.value))} data-testid="cmp-days-input" /></Field>}
          <Field label="Priority"><select className={sel + " w-full"} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} data-testid="cmp-priority-select"><option>low</option><option>normal</option><option>high</option></select></Field>
          <Field label="Schedule (empty = send now)"><Input className="inp" type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} data-testid="cmp-schedule-input" /></Field>
          <Field label="Expiration"><Input className="inp" type="datetime-local" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} data-testid="cmp-expiry-input" /></Field>
        </div>
        <div><p className="text-sm text-slate-300 mb-2">Delivery channels</p><div className="flex flex-wrap gap-3">{CH.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-amber-500" checked={f.channels.includes(v)} onChange={() => setF({ ...f, channels: f.channels.includes(v) ? f.channels.filter((x) => x !== v) : [...f.channels, v] })} data-testid={`cmp-channel-${v}`} />{l}</label>)}</div></div>
        <ImageUpload sigPath="/admin/uploads/signature" sigBody={{ folder: "notifications" }} onUploaded={setImg} testid="cmp-image-upload" label="Optional image" />
        <ErrorBox error={err} />
        <div className="flex gap-2"><button className="btn-ghost" onClick={preview} data-testid="cmp-preview-audience-btn"><Eye className="w-4 h-4" />Preview audience</button>
          <button className="btn-gold flex-1" disabled={busy || !f.title || !f.message || !f.channels.length} onClick={submit} data-testid="cmp-send-btn"><Send className="w-4 h-4" />{f.scheduled_at ? "Schedule" : "Send now"}</button></div>
        {prev && <p className="text-sm text-slate-300" data-testid="cmp-audience-count">{prev.count} eligible recipients · {prev.push_granted} with push permission</p>}
      </Glass>
      <Glass><p className="eyebrow mb-3">Live preview</p>
        <div className="rounded-xl border border-amber-500/30 bg-slate-950/60 p-4 space-y-2" data-testid="cmp-preview">
          <p className="font-display text-lg text-white">{f.title || "Notification title"}</p>
          <div className="text-sm text-slate-300"><LinkText text={f.message || "Your message with links like www.example.com"} /></div>
          {f.link && <button className="btn-gold !py-1.5 text-sm">{f.cta_label || "Open"}</button>}
        </div>
      </Glass>
    </div>
  );
}

function Campaigns() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["campaigns"], queryFn: () => get("/admin/campaigns"), refetchInterval: 30000 });
  const save = useSave("campaigns", "Done");
  const refresh = () => qc.invalidateQueries({ queryKey: ["campaigns"] });
  return (
    <div data-testid="admin-campaigns-page">
      <PageHeader title="Notification management" subtitle="Server success is not proof a user viewed a notification; clicks are measured only when users open links." />
      <Tabs defaultValue="compose"><TabsList className="bg-slate-900 mb-4"><TabsTrigger value="compose" data-testid="cmp-tab-compose">Compose</TabsTrigger><TabsTrigger value="list" data-testid="cmp-tab-list">Campaigns & analytics</TabsTrigger></TabsList>
        <TabsContent value="compose"><Composer onDone={refresh} /></TabsContent>
        <TabsContent value="list">{isLoading ? <Loader /> : data.length ? <div className="space-y-3">{data.map((c) => (
          <Glass key={c.id} data-testid={`campaign-${c.id}`}>
            <div className="flex flex-wrap justify-between gap-3"><div><p className="text-white font-semibold">{c.title} <StatusBadge status={c.status} /></p><p className="text-xs text-slate-500">{c.channels.join(", ")} · {c.audience.type} · {c.priority} · {c.scheduled_at ? `scheduled ${fdate(c.scheduled_at)}` : fdate(c.created_at)}</p></div>
              <div className="flex gap-2"><button className="btn-ghost !py-1 !px-3 text-xs" onClick={() => save(api.post(`/admin/campaigns/${c.id}/test`))} data-testid={`cmp-test-${c.id}`}>Send test to me</button>
                {c.status !== "disabled" && <button className="btn-ghost !py-1 !px-3 text-xs !text-red-300" onClick={() => save(api.post(`/admin/campaigns/${c.id}/disable`))} data-testid={`cmp-disable-${c.id}`}><Ban className="w-3 h-3" />Disable</button>}</div></div>
            {c.stats && Object.keys(c.stats).length > 0 && <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 mt-3">{Object.entries(c.stats).map(([k, v]) => <div key={k} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2"><p className="text-[10px] text-slate-500">{k.replace(/_/g, " ")}</p><p className="font-num text-sm" data-testid={`cmp-stat-${k}`}>{v}</p></div>)}</div>}
          </Glass>))}</div> : <Empty title="No campaigns" />}</TabsContent>
      </Tabs>
    </div>
  );
}

function SupportAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState({ message: "", status: "answered" });
  const list = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => get("/admin/tickets", { status }) });
  const t = useQuery({ queryKey: ["admin-ticket", open], queryFn: () => get(`/admin/tickets/${open}`), enabled: !!open });
  const reply = async () => { try { await api.post(`/admin/tickets/${open}/reply`, msg); setMsg({ ...msg, message: "" }); qc.invalidateQueries({ queryKey: ["admin-ticket", open] }); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); toast.success("Reply sent"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div data-testid="admin-support-page">
      <PageHeader title="Support tickets" />
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5">
        <Glass><select className={sel + " mb-3"} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="tickets-status-filter"><option value="">All</option><option>open</option><option>answered</option><option>closed</option></select>
          {list.data?.length ? list.data.map((x) => <button key={x.id} onClick={() => setOpen(x.id)} className={`w-full text-left py-3 px-2 border-b border-slate-800 rounded ${open === x.id ? "bg-amber-500/5" : ""}`} data-testid={`admin-ticket-${x.id}`}>
            <div className="flex justify-between gap-2"><p className="text-sm text-white">{x.subject}</p><StatusBadge status={x.status} /></div><p className="text-xs text-slate-500">{x.user_email} · {x.category} · {fdate(x.updated_at)}</p></button>) : <Empty title="No tickets" />}</Glass>
        <Glass>{!open ? <Empty title="Select a ticket" /> : t.isLoading ? <Loader /> : (<div className="space-y-3" data-testid="admin-ticket-thread">
          <h3 className="text-white font-semibold">{t.data.subject}</h3>
          {t.data.replies.map((r) => <div key={r.id} className={`rounded-xl p-3 text-sm ${r.author_role === "admin" ? "bg-blue-500/10 border border-blue-500/30" : "bg-slate-900 border border-slate-800"}`}><p className="text-[11px] text-slate-500">{r.author_role} · {fdate(r.created_at)}</p><p className="whitespace-pre-wrap">{r.message}</p></div>)}
          <Textarea className="inp" value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} data-testid="admin-reply-input" />
          <div className="flex gap-2"><select className={sel} value={msg.status} onChange={(e) => setMsg({ ...msg, status: e.target.value })} data-testid="admin-reply-status"><option>answered</option><option>open</option><option>closed</option></select>
            <button className="btn-gold flex-1" disabled={!msg.message} onClick={reply} data-testid="admin-reply-btn">Send reply</button></div></div>)}</Glass>
      </div>
    </div>
  );
}

function CmsItem({ item }) {
  const [txt, setTxt] = useState(JSON.stringify(item.value, null, 2));
  const [err, setErr] = useState(null);
  const save = useSave("cms", `${item.key} saved`);
  const submit = () => { try { const v = JSON.parse(txt); setErr(null); save(api.put(`/admin/content/${item.key}`, { value: v })); } catch { setErr("Invalid JSON — check commas and quotes"); } };
  return (
    <Glass data-testid={`cms-item-${item.key}`}>
      <div className="flex justify-between items-center mb-2"><p className="font-num text-amber-300 text-sm">{item.key}</p><span className="text-xs text-slate-500">{item.updated_by || "seed"} · {fdate(item.updated_at)}</span></div>
      <Textarea className="inp font-num text-xs min-h-[180px]" value={txt} onChange={(e) => setTxt(e.target.value)} data-testid={`cms-editor-${item.key}`} />
      <ErrorBox error={err} />
      <button className="btn-gold !py-1.5 mt-2 text-sm" onClick={submit} data-testid={`cms-save-${item.key}`}>Save</button>
    </Glass>
  );
}

function Cms() {
  const { data, isLoading } = useQuery({ queryKey: ["cms"], queryFn: () => get("/admin/content") });
  const [filter, setFilter] = useState("");
  if (isLoading) return <Loader />;
  return (
    <div data-testid="admin-cms-page">
      <PageHeader title="Website CMS" subtitle="Edit homepage headline, banners, benefits, how-it-works, trading info, FAQs, footer and legal pages. Changes go live immediately. Rewards content is edited under Rewards." />
      <Input className="inp max-w-xs mb-4" placeholder="Filter sections (e.g. legal, faqs)" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="cms-filter-input" />
      <div className="grid lg:grid-cols-2 gap-4">{data.filter((i) => i.key.includes(filter)).map((i) => <CmsItem key={i.key} item={i} />)}</div>
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get("/admin/settings") });
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  if (isLoading) return <Loader />;
  const v = s || data;
  const set = (k, val) => setS({ ...v, [k]: val });
  const sub = (k, f, val) => setS({ ...v, [k]: { ...v[k], [f]: val } });
  const save = async () => {
    setBusy(true);
    try {
      const { integrations, key, ...body } = v;
      const r = await api.put("/admin/settings", body);
      setS(r.data); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Settings saved");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const inp = (label, val, onChange, testid, type = "text") => <Field label={label}><Input className="inp" type={type} value={val ?? ""} onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)} data-testid={testid} /></Field>;
  return (
    <div data-testid="admin-settings-page">
      <PageHeader title="System settings" actions={<button className="btn-gold" disabled={busy} onClick={save} data-testid="settings-save-btn">Save all settings</button>} />
      <MyPassword />
      <div className="grid lg:grid-cols-2 gap-5">
        <Glass className="space-y-3"><h3 className="font-semibold text-white">General & branding</h3>
          {inp("Website name", v.site_name, (x) => set("site_name", x), "set-site-name")}{inp("Logo URL", v.logo_url, (x) => set("logo_url", x), "set-logo-url")}{inp("Favicon URL", v.favicon_url, (x) => set("favicon_url", x), "set-favicon-url")}
          {inp("Theme", v.theme, (x) => set("theme", x), "set-theme")}{inp("Contact email", v.contact.email, (x) => sub("contact", "email", x), "set-contact-email")}{inp("Contact phone", v.contact.phone, (x) => sub("contact", "phone", x), "set-contact-phone")}
          {inp("Address", v.contact.address, (x) => sub("contact", "address", x), "set-contact-address")}
          <Field label="Company information"><Textarea className="inp" value={v.company_info} onChange={(e) => set("company_info", e.target.value)} data-testid="set-company-info" /></Field>
          <label className="flex items-center justify-between text-sm">Maintenance mode (blocks non-admin users) <Switch checked={v.maintenance_mode} onCheckedChange={(x) => set("maintenance_mode", x)} data-testid="set-maintenance" /></label>
          <p className="text-xs text-slate-500">Money mode: <span className="text-emerald-300">USDT wallet (on-chain verified)</span> · Plans and commissions: <span className="text-amber-300">coin-based only</span></p></Glass>
        <Glass className="space-y-3"><h3 className="font-semibold text-white">Telegram support</h3>
          {inp("Username", v.telegram.username, (x) => sub("telegram", "username", x), "set-tg-username")}{inp("URL (https://t.me/…)", v.telegram.url, (x) => sub("telegram", "url", x), "set-tg-url")}
          {inp("Button text", v.telegram.button_text, (x) => sub("telegram", "button_text", x), "set-tg-button")}{inp("Availability message", v.telegram.availability, (x) => sub("telegram", "availability", x), "set-tg-availability")}
          {inp("Default support message", v.telegram.default_message, (x) => sub("telegram", "default_message", x), "set-tg-message")}</Glass>
        <Glass className="space-y-3"><h3 className="font-semibold text-white flex items-center gap-2">Coin system</h3>
          <div className="grid grid-cols-3 gap-3">{inp("Display name", v.coin.name, (x) => sub("coin", "name", x), "set-coin-name")}{inp("Symbol", v.coin.symbol, (x) => sub("coin", "symbol", x), "set-coin-symbol")}{inp("Decimals", v.coin.decimals, (x) => sub("coin", "decimals", x), "set-coin-decimals", "number")}</div>
          <div className="grid grid-cols-2 gap-3">{Object.keys(v.coin.rates).map((c) => <div key={c}>{inp(`1 ${c} = coins`, v.coin.rates[c], (x) => sub("coin", "rates", { ...v.coin.rates, [c]: x }), `set-rate-${c}`, "number")}</div>)}</div>
          <div className="text-xs text-slate-400"><p className="font-semibold text-slate-300 mb-1">Conversion history</p>{v.coin.history?.length ? v.coin.history.map((h, i) => <p key={i}>{fdate(h.at)} · {JSON.stringify(h.rates)} → {JSON.stringify(h.changed_to)} by {h.by}</p>) : "No changes yet"}</div></Glass>
        <Glass className="space-y-3"><h3 className="font-semibold text-white">Feature flags & limits</h3>
          {Object.keys(v.features).map((k) => <label key={k} className="flex items-center justify-between text-sm capitalize">{k.replace("_", " ")}<Switch checked={v.features[k]} onCheckedChange={(x) => sub("features", k, x)} data-testid={`set-feature-${k}`} /></label>)}
          <div className="grid grid-cols-2 gap-3">{inp("Session idle timeout (min)", v.session_timeout_minutes, (x) => set("session_timeout_minutes", x), "set-session-timeout", "number")}
            {inp("Plan day length (sec)", v.simulation_day_seconds, (x) => set("simulation_day_seconds", x), "set-sim-day", "number")}
            {inp("Sign-up coin grant", v.signup_demo_grant, (x) => set("signup_demo_grant", x), "set-grant", "number")}{inp("Team messages per day", v.team_message_daily_limit, (x) => set("team_message_daily_limit", x), "set-tm-limit", "number")}
            {inp("Withdrawal min", v.withdrawal.min, (x) => sub("withdrawal", "min", x), "set-wd-min", "number")}{inp("Withdrawal max", v.withdrawal.max, (x) => sub("withdrawal", "max", x), "set-wd-max", "number")}
            {inp("Withdrawal fee %", v.withdrawal.fee_percent, (x) => sub("withdrawal", "fee_percent", x), "set-wd-fee", "number")}{inp("Withdrawal flat fee", v.withdrawal.fee_flat, (x) => sub("withdrawal", "fee_flat", x), "set-wd-flat", "number")}</div></Glass>
        <Glass className="space-y-2 lg:col-span-2" data-testid="integrations-panel"><h3 className="font-semibold text-white">Integrations (secrets are stored in server environment variables only)</h3>
          <p className="text-sm">Cloudinary: <StatusBadge status={data.integrations.cloudinary_configured ? "active" : "failed"} /> cloud <span className="font-num">{data.integrations.cloudinary_cloud}</span></p>
          <p className="text-sm">Web Push (VAPID): <StatusBadge status={data.integrations.vapid_configured ? "active" : "failed"} /> <span className="font-num text-xs break-all">{data.integrations.vapid_public_key}</span></p>
          <p className="text-sm">Email provider: <span className="text-violet-300">{data.integrations.email_provider}</span></p></Glass>
      </div>
    </div>
  );
}

const PAGES = { plans: Plans, rewards: Rewards, campaigns: Campaigns, support: SupportAdmin, cms: Cms, settings: Settings };
export default function AdminContent({ page }) {
  const P = PAGES[page];
  return <P />;
}
