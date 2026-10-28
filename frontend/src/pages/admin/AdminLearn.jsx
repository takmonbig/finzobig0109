import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { pixelStatus } from "@/lib/pixel";
import { Glass, PageHeader, Stat, Loader, Empty, ErrorBox, Field, Confirm } from "@/components/common";

const get = (url) => api.get(url).then((r) => r.data);
const lines = (a) => (a || []).join("\n");
const unlines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const ICONS = ["ArrowDownToLine", "ArrowUpFromLine", "Landmark", "Smartphone", "ShieldCheck", "Wallet", "Users", "PlayCircle", "BookOpen"];
const sel = "w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 h-10 text-sm";

function WebinarAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-webinar"], queryFn: () => get("/admin/webinar"), refetchInterval: false });
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const save = useMutation({ mutationFn: (b) => api.put("/admin/webinar", b), onSuccess: () => { toast.success("Webinar saved"); setErr(null); qc.invalidateQueries({ queryKey: ["admin-webinar"] }); qc.invalidateQueries({ queryKey: ["webinar"] }); }, onError: (e) => setErr(errMsg(e)) });
  if (isLoading) return <Loader />;
  const f = v || { ...data, highlights_text: lines(data.highlights) };
  const set = (k, x) => setV({ ...f, [k]: x });
  const t = (label, k, testid) => <Field label={label}><Input className="inp" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={testid} /></Field>;
  const submit = () => { const { highlights_text, stats, key, video_id, ...rest } = f; save.mutate({ ...rest, highlights: unlines(highlights_text), min_watch_seconds: Number(f.min_watch_seconds) || 0, reminder_hours: Number(f.reminder_hours) || 24 }); };
  return (
    <div className="space-y-5" data-testid="admin-webinar">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Users" value={data.stats.users} testid="webinar-stat-users" /><Stat label="Started" value={data.stats.started} tone="blue" testid="webinar-stat-started" />
        <Stat label="Completed" value={data.stats.completed} tone="emerald" testid="webinar-stat-completed" hint={data.stats.users ? `${Math.round((data.stats.completed / data.stats.users) * 100)}% of users` : ""} />
        <Stat label="Reminded" value={data.stats.reminded ?? 0} tone="violet" testid="webinar-stat-reminded" />
      </div>
      <Glass className="space-y-4">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.enabled} onCheckedChange={(x) => set("enabled", x)} data-testid="webinar-enabled-switch" />Webinar enabled</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.required} onCheckedChange={(x) => set("required", x)} data-testid="webinar-required-switch" />Required after sign-up (blocking popup)</label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">{t("YouTube link — English", "video_url", "webinar-video-url-input")}{t("YouTube link — বাংলা (Bengali)", "video_url_bn", "webinar-video-url-bn-input")}{t("YouTube link — हिन्दी (Hindi)", "video_url_hi", "webinar-video-url-hi-input")}</div>
        <p className="text-xs text-slate-500 -mt-2">Unlisted links work. Users get a language switch above the video and see their chosen site language first.</p>
        <div className="grid sm:grid-cols-2 gap-3">{t("Title", "title", "webinar-title-input")}{t("Host", "host", "webinar-host-input")}{t("Duration label", "duration", "webinar-duration-input")}{t("Button text after completion", "cta_text", "webinar-cta-input")}</div>
        {t("Subtitle", "subtitle", "webinar-subtitle-input")}
        <Field label="Description"><Textarea className="inp" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} data-testid="webinar-description-input" /></Field>
        <Field label="What you'll learn (one per line)"><Textarea className="inp" rows={4} value={f.highlights_text} onChange={(e) => set("highlights_text", e.target.value)} data-testid="webinar-highlights-input" /></Field>
        <Field label="Minimum watch time before 'I've watched' unlocks (seconds)"><Input className="inp font-num" type="number" value={f.min_watch_seconds} onChange={(e) => set("min_watch_seconds", e.target.value)} data-testid="webinar-min-watch-input" /></Field>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.reminder_enabled ?? true} onCheckedChange={(x) => set("reminder_enabled", x)} data-testid="webinar-reminder-switch" />Remind members who haven't finished</label>
          <Field label="Send reminder after (hours since sign-up)"><Input className="inp font-num" type="number" value={f.reminder_hours ?? 24} onChange={(e) => set("reminder_hours", e.target.value)} data-testid="webinar-reminder-hours-input" /></Field>
        </div>
        {data.video_id && <a href={`https://www.youtube.com/watch?v=${data.video_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Current video: {data.video_id}</a>}
        <ErrorBox error={err} />
        <button className="btn-gold" disabled={save.isPending} onClick={submit} data-testid="webinar-save-btn">Save webinar</button>
      </Glass>
    </div>
  );
}

const EMPTY_G = { title: "", slug: "", description: "", video_url: "", video_url_bn: "", video_url_hi: "", icon: "PlayCircle", steps_text: "", order: 0, active: true };

function GuidesAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-guides"], queryFn: () => get("/admin/guides"), refetchInterval: false });
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const done = (msg) => { toast.success(msg); setEdit(null); qc.invalidateQueries({ queryKey: ["admin-guides"] }); qc.invalidateQueries({ queryKey: ["guides"] }); };
  const save = useMutation({ mutationFn: ({ id, steps_text, views, created_at, video_id, video_id_bn, video_id_hi, ...b }) => { const body = { ...b, steps: unlines(steps_text), order: Number(b.order) || 0 }; return id ? api.put(`/admin/guides/${id}`, body) : api.post("/admin/guides", body); },
    onSuccess: () => done("Guide saved"), onError: (e) => setErr(errMsg(e)) });
  const del = useMutation({ mutationFn: (id) => api.delete(`/admin/guides/${id}`), onSuccess: () => done("Guide deleted"), onError: (e) => toast.error(errMsg(e)) });
  const s = (k, x) => setEdit({ ...edit, [k]: x });
  return (
    <div data-testid="admin-guides">
      <div className="flex justify-end mb-3"><button className="btn-gold" onClick={() => { setErr(null); setEdit({ ...EMPTY_G }); }} data-testid="add-guide-btn"><Plus className="w-4 h-4" />Add guide</button></div>
      <Glass>{isLoading ? <Loader /> : data.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="guides-table"><thead><tr><th>#</th><th>Title</th><th>Video</th><th>Views</th><th>Status</th><th /></tr></thead>
        <tbody>{data.map((g) => <tr key={g.id}><td>{g.order}</td><td>{g.title}<p className="text-xs text-slate-500">/{g.slug}</p></td><td className="font-num text-xs">{g.video_id || <span className="text-amber-300">not set</span>}</td><td className="font-num">{g.views}</td>
          <td>{g.active ? <span className="text-emerald-300 text-xs">Active</span> : <span className="text-slate-500 text-xs">Hidden</span>}</td>
          <td className="flex gap-2"><button className="btn-ghost !py-1 !px-2" onClick={() => { setErr(null); setEdit({ ...g, steps_text: lines(g.steps) }); }} data-testid={`edit-guide-${g.slug}`}><Pencil className="w-3.5 h-3.5" /></button>
            <Confirm testid={`delete-guide-${g.slug}`} title={`Delete "${g.title}"?`} description="This guide will be removed from every user dashboard." onConfirm={() => del.mutate(g.id)} confirmLabel="Delete"
              trigger={<button className="btn-ghost !py-1 !px-2 text-red-300" data-testid={`delete-guide-btn-${g.slug}`}><Trash2 className="w-3.5 h-3.5" /></button>} /></td></tr>)}</tbody></table></div> : <Empty title="No guides yet" />}</Glass>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-lg max-h-[88vh] overflow-y-auto" data-testid="guide-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit guide" : "New guide"}</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3">
            <Field label="Title"><Input className="inp" value={edit.title} onChange={(e) => s("title", e.target.value)} data-testid="guide-title-input" /></Field>
            <Field label="Slug (URL)" hint="lowercase-with-dashes"><Input className="inp font-num" value={edit.slug} onChange={(e) => s("slug", e.target.value)} data-testid="guide-slug-input" /></Field>
            <Field label="Short description"><Input className="inp" value={edit.description} onChange={(e) => s("description", e.target.value)} data-testid="guide-description-input" /></Field>
            <Field label="YouTube link — English"><Input className="inp" value={edit.video_url} onChange={(e) => s("video_url", e.target.value)} data-testid="guide-video-input" /></Field>
            <div className="grid sm:grid-cols-2 gap-3"><Field label="YouTube link — বাংলা"><Input className="inp" value={edit.video_url_bn || ""} onChange={(e) => s("video_url_bn", e.target.value)} data-testid="guide-video-bn-input" /></Field>
              <Field label="YouTube link — हिन्दी"><Input className="inp" value={edit.video_url_hi || ""} onChange={(e) => s("video_url_hi", e.target.value)} data-testid="guide-video-hi-input" /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Icon"><select className={sel} value={edit.icon} onChange={(e) => s("icon", e.target.value)} data-testid="guide-icon-select">{ICONS.map((i) => <option key={i}>{i}</option>)}</select></Field>
              <Field label="Order"><Input className="inp font-num" type="number" value={edit.order} onChange={(e) => s("order", e.target.value)} data-testid="guide-order-input" /></Field></div>
            <Field label="Steps (one per line)"><Textarea className="inp" rows={5} value={edit.steps_text} onChange={(e) => s("steps_text", e.target.value)} data-testid="guide-steps-input" /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active} onCheckedChange={(x) => s("active", x)} data-testid="guide-active-switch" />Visible to users</label>
            <ErrorBox error={err} />
            <button className="btn-gold w-full" disabled={save.isPending} onClick={() => save.mutate(edit)} data-testid="guide-save-btn">Save guide</button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pixels() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-pixels"], queryFn: () => get("/admin/pixels"), refetchInterval: false });
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const done = (msg) => { toast.success(msg); setEdit(null); qc.invalidateQueries({ queryKey: ["admin-pixels"] }); };
  const save = useMutation({ mutationFn: ({ id, created_at, updated_at, ...b }) => (id ? api.put(`/admin/pixels/${id}`, b) : api.post("/admin/pixels", b)),
    onSuccess: () => done("Pixel saved. It loads on every page after the next page refresh."), onError: (e) => setErr(errMsg(e)) });
  const del = useMutation({ mutationFn: (id) => api.delete(`/admin/pixels/${id}`), onSuccess: () => done("Pixel deleted"), onError: (e) => toast.error(errMsg(e)) });
  const test = (p) => {
    const st = pixelStatus();
    if (!window.fbq || !st.ids.includes(p.pixel_id)) return toast.error("This pixel is not loaded in this tab yet. Make sure it is active, then refresh the page.");
    window.fbq("trackSingle", p.pixel_id, "PageView");
    toast.success(`Test PageView sent to ${p.pixel_id}. Check Meta Events Manager → Test events.`);
  };
  if (isLoading) return <Loader />;
  const s = (k, x) => setEdit({ ...edit, [k]: x });
  const toggleEv = (ev) => s("events", edit.events.includes(ev) ? edit.events.filter((x) => x !== ev) : [...edit.events, ev]);
  const st = pixelStatus();
  return (
    <div data-testid="admin-pixels-page">
      <PageHeader title="Meta Pixels" subtitle="Add, edit, replace or delete Meta (Facebook) Pixels. Active pixels load on the website and dashboards and receive the events you select."
        actions={<button className="btn-gold" onClick={() => { setErr(null); setEdit({ name: "", pixel_id: "", active: true, events: [...data.events] }); }} data-testid="add-pixel-btn"><Plus className="w-4 h-4" />Add pixel</button>} />
      <p className="text-xs text-slate-500 mb-3" data-testid="pixel-script-status">Pixel script in this tab: {st.scriptReady ? <span className="text-emerald-300">loaded ({st.ids.join(", ")})</span> : st.loaded ? <span className="text-amber-300">loading…</span> : <span className="text-slate-400">no active pixels loaded</span>}</p>
      <Glass>{data.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="pixels-table"><thead><tr><th>Name</th><th>Pixel ID</th><th>Events</th><th>Status</th><th>Updated</th><th /></tr></thead>
        <tbody>{data.items.map((p) => <tr key={p.id}><td>{p.name}</td><td className="font-num">{p.pixel_id}</td><td className="text-xs text-slate-400 max-w-[260px]">{p.events.join(", ")}</td>
          <td>{p.active ? <span className="text-emerald-300 text-xs">Active</span> : <span className="text-slate-500 text-xs">Paused</span>}</td><td className="text-xs">{new Date(p.updated_at).toLocaleString()}</td>
          <td className="flex gap-2"><button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => test(p)} data-testid={`test-pixel-${p.pixel_id}`}><Zap className="w-3.5 h-3.5" />Test</button>
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => { setErr(null); setEdit({ ...p }); }} data-testid={`edit-pixel-${p.pixel_id}`}><Pencil className="w-3.5 h-3.5" />Edit / replace</button>
            <Confirm testid={`delete-pixel-${p.pixel_id}`} title={`Delete pixel ${p.pixel_id}?`} description="Tracking with this pixel stops on all pages." onConfirm={() => del.mutate(p.id)} confirmLabel="Delete"
              trigger={<button className="btn-ghost !py-1 !px-2 text-red-300" data-testid={`delete-pixel-btn-${p.pixel_id}`}><Trash2 className="w-3.5 h-3.5" /></button>} /></td></tr>)}</tbody></table></div> : <Empty title="No pixels yet" text="Add your first Meta Pixel ID to start tracking." />}</Glass>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-md" data-testid="pixel-dialog">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit / replace pixel" : "Add Meta Pixel"}</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3">
            <Field label="Name"><Input className="inp" value={edit.name} onChange={(e) => s("name", e.target.value)} placeholder="Main ads account" data-testid="pixel-name-input" /></Field>
            <Field label="Pixel ID" hint="Numbers only, from Meta Events Manager. Changing it replaces the old pixel."><Input className="inp font-num" value={edit.pixel_id} onChange={(e) => s("pixel_id", e.target.value.trim())} data-testid="pixel-id-input" /></Field>
            <div><p className="text-sm text-slate-300 mb-2">Events to send</p><div className="flex flex-wrap gap-2">{data.events.map((ev) => <button key={ev} type="button" onClick={() => toggleEv(ev)} data-testid={`pixel-event-${ev}`}
              className={`px-3 py-1 rounded-lg text-xs border ${edit.events.includes(ev) ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-400"}`}>{ev}</button>)}</div>
              <p className="text-[11px] text-slate-500 mt-2">PageView: every page · CompleteRegistration: sign-up · ViewContent: webinar started · Lead: webinar completed · InitiateCheckout: deposit request</p></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active} onCheckedChange={(x) => s("active", x)} data-testid="pixel-active-switch" />Active</label>
            <ErrorBox error={err} />
            <button className="btn-gold w-full" disabled={save.isPending} onClick={() => (/^\d{10,20}$/.test(edit.pixel_id) ? save.mutate(edit) : setErr("Pixel ID must be 10–20 digits"))} data-testid="pixel-save-btn">Save pixel</button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Learn() {
  const [tab, setTab] = useState("webinar");
  return (
    <div data-testid="admin-learn-page">
      <PageHeader title="Webinar & video guides" subtitle="Control the welcome webinar shown after sign-up and the how-to video boxes on every user dashboard." />
      <div className="flex gap-2 mb-5">{[["webinar", "Welcome webinar"], ["guides", "Video guides"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`learn-tab-${k}`}
        className={`px-4 py-2 rounded-xl text-sm border ${tab === k ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-300"}`}>{l}</button>)}</div>
      {tab === "webinar" ? <WebinarAdmin /> : <GuidesAdmin />}
    </div>
  );
}

const PAGES = { learn: Learn, pixels: Pixels };
export default function AdminLearn({ page }) {
  const P = PAGES[page];
  return <P />;
}
