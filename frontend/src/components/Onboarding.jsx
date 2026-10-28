import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, Wallet, ArrowDownToLine, ArrowUpFromLine, Network, Bell, LifeBuoy, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LANGS, getLang, applyLang, loadTranslator } from "@/lib/i18n";

export function LanguagePicker() {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
  const [open, setOpen] = useState(() => !getLang());
  useEffect(() => { loadTranslator(); }, []);
  if (isAdmin) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { localStorage.setItem("lang", "en"); setOpen(false); } }}>
      <DialogContent className="bg-[#0C1120] border-amber-500/30 max-w-sm notranslate" data-testid="language-picker">
        <DialogHeader>
          <span className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-300 grid place-items-center mb-1"><Languages className="w-6 h-6" /></span>
          <DialogTitle className="text-center">Choose your language</DialogTitle>
          <DialogDescription className="text-center">भाषा चुनें · ভাষা নির্বাচন করুন</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2">{LANGS.map(([c, n, en]) => (
          <button key={c} onClick={() => (c === "en" ? (localStorage.setItem("lang", "en"), setOpen(false)) : applyLang(c))} data-testid={`lang-${c}`}
            className="w-full flex items-center justify-between rounded-xl border border-slate-700 hover:border-amber-400 hover:bg-amber-500/10 px-4 py-3 transition-colors">
            <span className="text-white font-semibold">{n}</span><span className="text-xs text-slate-400">{en}</span></button>))}</div>
      </DialogContent>
    </Dialog>
  );
}

export function LangSwitcher() {
  const cur = getLang() || "en";
  return (
    <select value={cur} onChange={(e) => applyLang(e.target.value)} className="notranslate bg-transparent border border-slate-700 rounded-full text-xs text-slate-200 px-2 py-1.5" data-testid="lang-switcher" aria-label="Language">
      {LANGS.map(([c, n]) => <option key={c} value={c} className="bg-slate-900">{n}</option>)}
    </select>
  );
}

const STEPS = [
  [Wallet, "Your dashboard", "See your USDT balance, team size, rank and latest activity in one place."],
  [ArrowDownToLine, "Deposit USDT", "Pick an amount, send USDT on TRC20 or BEP20 and submit the transaction hash."],
  [ArrowUpFromLine, "Withdraw", "Request a withdrawal from your USDT balance and follow each status update."],
  [Network, "Grow your team", "Share your referral link from My team and watch your network grow across 5 generations."],
  [Bell, "Stay updated", "Turn on notifications so you never miss an announcement or a payment update."],
  [LifeBuoy, "We're here to help", "Open a support ticket or chat with us on Telegram any time."],
];

export const tourKey = (uid) => `finzo_tour_done_${uid}`;

export function WelcomeTour({ user }) {
  const loc = useLocation();
  const [open, setOpen] = useState(() => !localStorage.getItem(tourKey(user.id)));
  const [i, setI] = useState(0);
  const close = () => { localStorage.setItem(tourKey(user.id), "1"); setOpen(false); window.dispatchEvent(new Event("tour:done")); };
  const [Icon, title, text] = STEPS[i];
  return (
    <Dialog open={open && !loc.pathname.startsWith("/app/webinar")} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="bg-[#0C1120] border-amber-500/30 max-w-md overflow-hidden" data-testid="welcome-tour">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <DialogHeader>
          <img src="/img/logo.png" alt="Finzo.cc" className="h-10 w-auto mx-auto object-contain" />
          <DialogTitle className="text-center">Welcome to Finzo, {user.full_name.split(" ")[0]}!</DialogTitle>
          <DialogDescription className="text-center">A quick tour of your dashboard</DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="text-center py-4" data-testid={`tour-step-${i}`}>
            <span className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-400/25 to-violet-500/20 text-amber-300 grid place-items-center mb-3"><Icon className="w-8 h-8" /></span>
            <h3 className="text-white font-semibold text-lg">{title}</h3><p className="text-sm text-slate-400 mt-1">{text}</p>
          </motion.div>
        </AnimatePresence>
        <div className="flex justify-center gap-1.5">{STEPS.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-amber-400" : "w-1.5 bg-slate-600"}`} />)}</div>
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost flex-1" onClick={close} data-testid="tour-skip-btn">Skip</button>
          {i < STEPS.length - 1
            ? <button className="btn-gold flex-1" onClick={() => setI(i + 1)} data-testid="tour-next-btn">Next<ChevronRight className="w-4 h-4" /></button>
            : <button className="btn-gold flex-1" onClick={close} data-testid="tour-done-btn">Let's go</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
