import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg } from "@/lib/api";
import { Glass, PageHeader, Loader, Field, ImageUpload, useSite } from "@/components/common";
import { CoinRateCard } from "@/components/home/TeamRate";

function MemberRow({ m, i, set, remove }) {
  return (
    <Glass className="space-y-2" data-testid={`admin-member-${i}`}>
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Name"><Input className="inp" value={m.name} onChange={(e) => set({ ...m, name: e.target.value })} data-testid={`member-name-${i}`} /></Field>
        <Field label="Position"><Input className="inp" value={m.role} onChange={(e) => set({ ...m, role: e.target.value })} data-testid={`member-role-${i}`} /></Field>
      </div>
      <Field label="Short bio"><Textarea className="inp" value={m.bio} onChange={(e) => set({ ...m, bio: e.target.value })} data-testid={`member-bio-${i}`} /></Field>
      <ImageUpload sigPath="/admin/uploads/signature" sigBody={{ folder: "team" }} value={m.image_url} onUploaded={(r) => r && set({ ...m, image_url: r.secure_url })} testid={`member-image-${i}`} label="Upload or replace photo" />
      <button className="text-xs text-red-300 flex items-center gap-1" onClick={remove} data-testid={`member-remove-${i}`}><Trash2 className="w-3 h-3" />Remove</button>
    </Glass>
  );
}

function Members({ initial }) {
  const qc = useQueryClient();
  const [list, setList] = useState(initial);
  const save = async () => {
    try { await api.put("/admin/team-members", { members: list }); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Team section saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-3" data-testid="admin-members">
      <div className="flex justify-between items-center"><h3 className="font-semibold text-white">Team members on the landing page</h3>
        <div className="flex gap-2"><button className="btn-ghost !py-1.5 text-sm" onClick={() => setList([...list, { name: "", role: "", bio: "", image_url: "" }])} data-testid="member-add-btn"><Plus className="w-4 h-4" />Add member</button>
          <button className="btn-gold !py-1.5 text-sm" onClick={save} data-testid="members-save-btn">Save team</button></div></div>
      {!list.length && <p className="text-sm text-slate-500">No members yet. The section is hidden on the website until you add one.</p>}
      <div className="grid lg:grid-cols-2 gap-3">{list.map((m, i) => <MemberRow key={i} m={m} i={i} set={(v) => setList(list.map((x, j) => (j === i ? v : x)))} remove={() => setList(list.filter((_, j) => j !== i))} />)}</div>
    </div>
  );
}

function Rate({ rate, coin }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ price_usd: rate?.price_usd || "", volume_usd: rate?.volume_usd || 0 });
  const save = async () => {
    try { await api.post("/admin/coin-rate", { price_usd: Number(f.price_usd), volume_usd: Number(f.volume_usd) }); qc.invalidateQueries({ queryKey: ["site"] }); toast.success("Rate updated"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="admin-coin-rate">
      <Glass className="space-y-3"><h3 className="font-semibold text-white">Set {coin?.name || "Finzo Coin"} rate</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Price (USD)"><Input className="inp font-num" type="number" step="any" value={f.price_usd} onChange={(e) => setF({ ...f, price_usd: e.target.value })} data-testid="rate-price-input" /></Field>
          <Field label="Volume (USD)"><Input className="inp font-num" type="number" step="any" value={f.volume_usd} onChange={(e) => setF({ ...f, volume_usd: e.target.value })} data-testid="rate-volume-input" /></Field></div>
        <p className="text-xs text-slate-500">Each update adds a point to the chart. Users see it labelled as a rate set by Finzo.cc.</p>
        <button className="btn-gold" disabled={!(Number(f.price_usd) > 0)} onClick={save} data-testid="rate-save-btn">Publish rate</button></Glass>
      <CoinRateCard rate={rate} name={coin?.name} symbol={coin?.symbol} />
    </div>
  );
}

export default function AdminTeamRate() {
  const { data, isLoading } = useSite();
  if (isLoading) return <Loader />;
  const c = data?.content || {};
  return (
    <div className="space-y-8" data-testid="admin-team-rate-page">
      <PageHeader title="Team section & coin rate" subtitle="Manage the people shown on the landing page and the Finzo Coin rate shown to users." />
      <Rate rate={c.coin_rate} coin={data?.settings?.coin} />
      <Members initial={c.team_members || []} />
    </div>
  );
}
