import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Megaphone, UserPlus, Users, Network, PlayCircle, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSite } from "@/components/common";

const LEVELS = [
  ["Level 1", "Your direct referral", UserPlus, "friend_signup", "friend_webinar", "from-amber-400 to-orange-500"],
  ["Level 2", "Your referral's referral", Users, "l2_signup", "l2_webinar", "from-sky-400 to-blue-600"],
  ["Level 3", "The next level down", Network, "l3_signup", "l3_webinar", "from-fuchsia-400 to-violet-600"],
];

export function ReferPoster({ amounts = {}, symbol = "FZC", onClose, showCta = true }) {
  const total = LEVELS.reduce((a, [, , , s, w]) => a + (amounts[s] ?? 0) + (amounts[w] ?? 0), 0);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#1b1464] text-white" data-testid="refer-poster">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,.55),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(236,72,153,.35),transparent_40%)]" />
      {onClose && <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-1.5 hover:bg-white/30 transition-colors" aria-label="Close" data-testid="refer-poster-close"><X className="w-4 h-4" /></button>}
      <div className="relative p-5 sm:p-7 space-y-5">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-amber-400 text-[#1b1464] items-center justify-center shrink-0 rotate-[-6deg]"><Megaphone className="w-7 h-7" /></div>
          <div>
            <p className="font-display text-4xl sm:text-5xl font-black leading-none tracking-tight"><span className="text-sky-200">REFER &</span> <span className="text-amber-400">EARN</span></p>
            <span className="inline-block mt-2 bg-violet-500 px-3 py-1 rounded-md text-xs font-bold tracking-wide">GET REWARDED AT 3 LEVELS</span>
            <p className="text-sm text-indigo-100 mt-2">Invite others, build your network and earn fixed {symbol} rewards up to 3 levels deep.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {LEVELS.map(([l, d, I, s, w, g]) => (
            <div key={l} className="rounded-xl bg-white/95 text-slate-900 p-2.5 sm:p-4 text-center" data-testid={`poster-${s}`}>
              <span className={`inline-block text-[10px] sm:text-xs font-bold text-white px-2 py-0.5 rounded-full bg-gradient-to-r ${g}`}>{l}</span>
              <p className="text-[11px] sm:text-sm font-semibold mt-2 leading-tight">{d}</p>
              <div className={`mx-auto my-2 w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br ${g} flex items-center justify-center text-white`}><I className="w-5 h-5 sm:w-7 sm:h-7" /></div>
              <p className="font-num text-xl sm:text-3xl font-black">+{amounts[s] ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-slate-600">{symbol} when they join</p>
              <p className="font-num text-base sm:text-xl font-bold mt-1 flex items-center justify-center gap-1"><PlayCircle className="w-3.5 h-3.5" />+{amounts[w] ?? 0}</p>
              <p className="text-[10px] sm:text-xs text-slate-600">{symbol} when they finish the webinar</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-black/30 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="bg-lime-400 text-[#1b1464] text-xs font-black px-2 py-1 rounded self-start">EXAMPLE</span>
          <p className="text-sm text-indigo-100 flex-1">You refer someone, they refer someone, and that person refers someone. All three join and finish the webinar.</p>
          <div className="text-center shrink-0"><p className="text-xs text-amber-200">Total you earn</p><p className="font-num text-3xl font-black text-amber-400" data-testid="poster-total">{total} {symbol}</p></div>
        </div>
        <p className="text-[11px] text-indigo-200">Rewards are fixed coin amounts per action and never depend on anyone's deposit. Own webinar: +{amounts.own_webinar ?? 0} {symbol}.</p>
        {showCta && <Link to="/register" onClick={onClose} className="btn-gold w-full justify-center !text-base" data-testid="poster-cta">START REFERRING TODAY <ArrowRight className="w-4 h-4" /></Link>}
      </div>
    </div>
  );
}

export function ReferPlanModal({ open, onClose, showCta, variant = "panel" }) {
  const { data: site } = useSite();
  const banner = site?.content?.promo_banner;
  const img = banner?.[`${variant}_image_url`];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 bg-transparent max-w-[min(96vw,42rem)] max-h-[92vh] overflow-y-auto shadow-2xl [&>button]:hidden" data-testid="refer-plan-modal">
        <DialogTitle className="sr-only">Refer and earn</DialogTitle>
        {img ? (
          <div className="relative">
            <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 text-white p-1.5" aria-label="Close" data-testid="refer-poster-close"><X className="w-4 h-4" /></button>
            <img src={img} alt={banner.title || "Refer & Earn"} className="w-full h-auto rounded-2xl" data-testid="refer-poster-image" />
          </div>
        ) : <ReferPoster amounts={site?.settings?.referral_rewards} symbol={site?.settings?.coin?.symbol} onClose={onClose} showCta={showCta} />}
      </DialogContent>
    </Dialog>
  );
}

export function FirstVisitPromo() {
  const { data: site } = useSite();
  const [open, setOpen] = useState(false);
  const banner = site?.content?.promo_banner;
  const key = `promo_seen:${banner?.version || "default"}`;
  useEffect(() => {
    if (!site || banner?.enabled === false || localStorage.getItem(key)) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [site, key, banner]);
  const close = () => { localStorage.setItem(key, "1"); setOpen(false); };
  return <ReferPlanModal open={open} onClose={close} showCta variant="popup" />;
}

export function ReferPlanButton({ className = "btn-gold" }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button className={className} onClick={() => setOpen(true)} data-testid="refer-plan-btn"><Megaphone className="w-4 h-4" />Refer plan</button>
    <ReferPlanModal open={open} onClose={() => setOpen(false)} showCta={false} />
  </>);
}
