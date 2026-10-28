import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { UserRound } from "lucide-react";
import { Glass } from "@/components/common";
import { Reveal, SectionHead } from "@/components/home/Sections";

export function TeamMembers({ members }) {
  if (!members?.length) return null;
  return (
    <section id="people" className="max-w-7xl mx-auto px-4 sm:px-6 py-20" data-testid="team-members-section">
      <SectionHead eyebrow="Our team" title="The people behind Finzo.cc" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {members.map((m, i) => (
          <Reveal key={i} delay={i * 0.05}>
            <Glass className="!p-0 overflow-hidden h-full" data-testid={`team-member-${i}`}>
              {m.image_url ? <img src={m.image_url} alt={m.name} className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square grid place-items-center bg-slate-900"><UserRound className="w-12 h-12 text-slate-600" /></div>}
              <div className="p-4"><p className="text-white font-semibold">{m.name}</p><p className="text-xs text-amber-300">{m.role}</p>{m.bio && <p className="text-xs text-slate-400 mt-2">{m.bio}</p>}</div>
            </Glass>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const usd = (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;

export function CoinRateCard({ rate, name = "Finzo Coin", symbol = "FZC" }) {
  if (!rate?.price_usd) return null;
  const h = (rate.history || []).map((p) => ({ d: new Date(p.at).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), v: p.price_usd }));
  const prev = h.length > 1 ? h[h.length - 2].v : h[0]?.v;
  const chg = prev ? ((rate.price_usd - prev) / prev) * 100 : 0;
  return (
    <Glass data-testid="coin-rate-card">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div><p className="eyebrow">{name} ({symbol}) rate</p>
          <p className="font-num text-3xl text-white mt-1" data-testid="coin-rate-price">{usd(rate.price_usd)}</p>
          <p className={`text-xs font-num ${chg >= 0 ? "text-emerald-300" : "text-red-300"}`} data-testid="coin-rate-change">{chg >= 0 ? "+" : ""}{chg.toFixed(2)}% since last update</p></div>
        <div className="text-right text-xs text-slate-400"><p>Volume: <span className="font-num text-slate-200" data-testid="coin-rate-volume">{usd(rate.volume_usd || 0)}</span></p><p>Updated {new Date(rate.at).toLocaleString()}</p></div>
      </div>
      {h.length > 1 && <div className="h-40"><ResponsiveContainer><AreaChart data={h}><defs><linearGradient id="cr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="d" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={10} width={50} domain={["auto", "auto"]} /><Tooltip contentStyle={{ background: "#0C1120", border: "1px solid #334155" }} formatter={(v) => usd(v)} />
        <Area type="monotone" dataKey="v" stroke="#f59e0b" fill="url(#cr)" /></AreaChart></ResponsiveContainer></div>}
      <p className="text-[11px] text-slate-500 mt-2" data-testid="coin-rate-note">Rate set and controlled by Finzo.cc. This is not an open-market price.</p>
    </Glass>
  );
}

export function CoinRateSection({ rate, coin }) {
  if (!rate?.price_usd) return null;
  return (
    <section id="coin-rate" className="max-w-7xl mx-auto px-4 sm:px-6 py-12"><CoinRateCard rate={rate} name={coin?.name} symbol={coin?.symbol} /></section>
  );
}
