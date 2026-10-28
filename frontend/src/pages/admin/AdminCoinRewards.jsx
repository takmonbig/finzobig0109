import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api, coins, errMsg, fdate } from "@/lib/api";
import { Glass, PageHeader, Loader, Empty, Field, Pager, ImageUpload, useSite } from "@/components/common";
import { ACTIONS } from "@/pages/app/CoinRewards";
import { ReferPlanModal } from "@/components/ReferPlan";

function Amounts({ initial }) {
  const qc = useQueryClient();
  const [a, setA] = useState(initial);
  const save = async () => {
    try { await api.put("/admin/settings", { referral_rewards: a }); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Reward amounts saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="space-y-3 mb-5" data-testid="coin-amounts-editor"><h3 className="font-semibold text-white">Coins per action</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Object.entries(ACTIONS).map(([k, [l]]) => <Field key={k} label={l}><Input className="inp font-num" type="number" min={0} value={a[k] ?? 0} onChange={(e) => setA({ ...a, [k]: e.target.value })} data-testid={`coin-amount-${k}`} /></Field>)}</div>
      <button className="btn-gold" onClick={save} data-testid="coin-amounts-save-btn">Save amounts</button></Glass>
  );
}

const SLOTS = [["popup", "First-time visitor popup", "Shown once to every new visitor on the website."], ["panel", "Refer panel image", "Opens from the \"Refer plan\" button in the user dashboard."]];

function PromoBanner({ initial }) {
  const qc = useQueryClient();
  const [b, setB] = useState({ popup_image_url: "", panel_image_url: "", enabled: true, title: "Refer & Earn", ...(initial || {}) });
  const [preview, setPreview] = useState(null);
  const save = async (v) => {
    try { await api.put("/admin/promo-banner", v); setB(v); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Promo images saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Glass className="space-y-4 mb-5" data-testid="promo-banner-editor">
      <div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold text-white">Refer & Earn images</h3>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={b.enabled} onChange={(e) => save({ ...b, enabled: e.target.checked })} data-testid="promo-enabled-toggle" />Show popup to first-time visitors</label></div>
      <div className="rounded-lg bg-slate-950/50 border border-slate-800 p-3 text-xs text-slate-400 space-y-1" data-testid="promo-size-hint">
        <p className="text-slate-200 font-semibold">Best image size (mobile friendly)</p>
        <p>Portrait <span className="font-num text-amber-300">1080 × 1620 px</span> (2:3), JPG/PNG/WEBP, under 1 MB. Keep text inside the centre 90% — the popup fills the phone screen width and scrolls if taller.</p>
        <p>Without an uploaded image, the built-in poster uses the live reward amounts above.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {SLOTS.map(([k, title, desc]) => { const f = `${k}_image_url`; return (
          <div key={k} className="space-y-2 rounded-xl border border-slate-800 p-3" data-testid={`promo-slot-${k}`}>
            <p className="font-semibold text-white text-sm">{title}</p><p className="text-xs text-slate-500">{desc}</p>
            <ImageUpload sigPath="/admin/uploads/signature" sigBody={{ folder: "cms" }} value={b[f]} onUploaded={(r) => r && save({ ...b, [f]: r.secure_url })} testid={`promo-image-${k}`} label={b[f] ? "Replace image" : "Upload image"} />
            <div className="flex flex-wrap gap-2">
              {b[f] && <button className="btn-ghost !py-1.5 text-sm" onClick={() => save({ ...b, [f]: "" })} data-testid={`promo-image-remove-${k}`}>Remove · use built-in poster</button>}
              <button className="btn-ghost !py-1.5 text-sm" onClick={() => setPreview(k)} data-testid={`promo-preview-${k}`}>Preview</button></div>
          </div>); })}
      </div>
      <ReferPlanModal open={!!preview} onClose={() => setPreview(null)} showCta variant={preview || "panel"} />
    </Glass>
  );
}

export default function AdminCoinRewards() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data: site } = useSite();
  const st = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get("/admin/settings").then((r) => r.data) });
  const { data, isLoading } = useQuery({ queryKey: ["admin-coin-rewards", q, page], queryFn: () => api.get("/admin/coin-rewards", { params: { q: q || undefined, page } }).then((r) => r.data) });
  return (
    <div data-testid="admin-coin-rewards-page">
      <PageHeader title="Coin rewards" subtitle="Fixed Finzo Coin rewards for referral actions. Not linked to deposits; not withdrawable." />
      {st.data && <Amounts initial={st.data.referral_rewards || {}} />}
      {site && <PromoBanner initial={site.content?.promo_banner} />}
      {data && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">{Object.entries(ACTIONS).map(([k, [l]]) => <Glass key={k} className="!p-3"><p className="text-xs text-slate-500">{l}</p><p className="font-num text-white" data-testid={`coin-total-${k}`}>{coins(data.totals[k]?.amount || 0)} · {data.totals[k]?.count || 0}×</p></Glass>)}</div>}
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
