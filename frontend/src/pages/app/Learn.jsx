import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { tourKey } from "@/components/Onboarding";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { track } from "@/lib/pixel";
import { Glass, Loader, Empty, ErrorBox, PageHeader } from "@/components/common";
import { toast } from "sonner";

const get = (url) => api.get(url).then((r) => r.data);
let ytReady = null;
const loadYT = () => {
  if (ytReady) return ytReady;
  ytReady = new Promise((res) => {
    if (window.YT?.Player) return res(window.YT);
    window.onYouTubeIframeAPIReady = () => res(window.YT);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(s);
  });
  return ytReady;
};

export function YTPlayer({ videoId, onPlay, onEnded, testid }) {
  const ref = useRef(null);
  useEffect(() => {
    let player;
    loadYT().then((YT) => {
      if (!ref.current) return;
      player = new YT.Player(ref.current, { videoId, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onStateChange: (e) => { if (e.data === 1) onPlay?.(); if (e.data === 0) onEnded?.(); } } });
    });
    return () => { player?.destroy?.(); };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-amber-500/30 shadow-[0_0_60px_rgba(245,158,11,.15)] bg-black" data-testid={testid}>
      <div ref={ref} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

const NoVideo = () => (
  <div className="aspect-video w-full rounded-2xl border border-dashed border-slate-700 grid place-items-center text-center p-6 bg-slate-950/50" data-testid="video-coming-soon">
    <div><Icons.Clapperboard className="w-10 h-10 text-amber-400 mx-auto mb-3" /><p className="text-white font-semibold">Video coming soon</p><p className="text-sm text-slate-400">Check back shortly.</p></div>
  </div>
);

function Webinar() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: w, isLoading } = useQuery({ queryKey: ["webinar"], queryFn: () => get("/webinar"), refetchInterval: false });
  const [secs, setSecs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);
  if (isLoading) return <Loader />;
  const completed = done || !!w.completed_at;
  const left = Math.max((w.min_watch_seconds || 0) - secs, 0);
  const start = () => { if (!playing) { setPlaying(true); api.post("/webinar/start"); track("ViewContent", { content_name: "webinar" }); } };
  const finish = async () => {
    try { await api.post("/webinar/complete"); track("Lead", { content_name: "webinar_completed" }); setDone(true); qc.invalidateQueries({ queryKey: ["webinar"] }); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="max-w-6xl mx-auto" data-testid="webinar-page">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-amber-500/20 p-6 sm:p-10 mb-6 bg-gradient-to-br from-violet-900/40 via-[#0C1120] to-amber-900/20">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl" />
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest px-3 py-1 rounded-full bg-red-500/15 border border-red-400/30 text-red-200"><span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />Welcome session</span>
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white font-bold mt-4 max-w-3xl" data-testid="webinar-title">{w.title}</h1>
        <p className="text-slate-300 mt-3 max-w-2xl">{w.subtitle}</p>
        <div className="flex flex-wrap gap-3 mt-5 text-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700"><Icons.User className="w-4 h-4 text-amber-400" />{w.host}</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700"><Icons.Clock className="w-4 h-4 text-amber-400" />{w.duration}</span>
          {completed && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200" data-testid="webinar-completed-badge"><Icons.CheckCircle2 className="w-4 h-4" />Completed</span>}
        </div>
      </motion.div>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="space-y-5">
          {w.video_id ? <YTPlayer videoId={w.video_id} onPlay={start} onEnded={() => { setSecs(99999); if (!completed) finish(); }} testid="webinar-video" /> : <NoVideo />}
          <Glass><h3 className="font-semibold text-white mb-2">About this webinar</h3><p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{w.description}</p></Glass>
        </div>
        <div className="space-y-5">
          <Glass>
            <h3 className="font-semibold text-white mb-4">What you'll learn</h3>
            <div className="space-y-3">{w.highlights.map((h, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }} className="flex gap-3 items-start">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-amber-500/15 text-amber-300 grid place-items-center text-sm font-bold">{i + 1}</span><p className="text-sm text-slate-300">{h}</p>
              </motion.div>))}</div>
          </Glass>
          <Glass className="text-center">
            {completed ? (<motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Icons.PartyPopper className="w-12 h-12 text-amber-400 mx-auto mb-3" /><p className="text-white font-semibold text-lg">You're all set!</p>
              <p className="text-sm text-slate-400 mb-4">Thanks for watching. Explore your dashboard and video guides.</p>
              <button className="btn-gold w-full" onClick={() => nav("/app")} data-testid="webinar-continue-btn">{w.cta_text}</button>
              <Link to="/app/guides" className="btn-ghost w-full mt-2" data-testid="webinar-guides-link">Watch video guides</Link>
            </motion.div>) : (<>
              <p className="text-sm text-slate-400 mb-3">{!w.video_id ? "The webinar video will be available soon." : playing ? (left ? `Keep watching — you can continue in ${left}s` : "Great! You can continue now.") : "Press play to start the webinar."}</p>
              <button className="btn-gold w-full" disabled={!!w.video_id && (left > 0 || !playing)} onClick={finish} data-testid="webinar-complete-btn">I've watched the webinar</button>
            </>)}
          </Glass>
        </div>
      </div>
    </div>
  );
}

export function GuidesGrid() {
  const { data } = useQuery({ queryKey: ["guides"], queryFn: () => get("/guides") });
  if (!data?.length) return null;
  return (
    <div className="my-6" data-testid="guides-grid">
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><Icons.PlayCircle className="w-5 h-5 text-amber-400" />Video guides</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map((g, i) => { const I = Icons[g.icon] || Icons.PlayCircle; return (
          <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
            <Link to={`/app/guides/${g.slug}`} className="glass glass-hover p-5 flex flex-col gap-3 h-full group" data-testid={`guide-card-${g.slug}`}>
              <div className="flex items-center justify-between"><span className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-300 grid place-items-center"><I className="w-5 h-5" /></span>
                <Icons.PlayCircle className="w-6 h-6 text-slate-600 group-hover:text-amber-400 transition-colors" /></div>
              <p className="text-white font-semibold">{g.title}</p><p className="text-xs text-slate-400">{g.description}</p>
            </Link>
          </motion.div>); })}
      </div>
    </div>
  );
}

function Guides() {
  return (<div data-testid="guides-page"><PageHeader title="Video guides" subtitle="Short videos that walk you through every step." />
    <Link to="/app/webinar" className="glass glass-hover p-5 flex items-center gap-4 mb-2" data-testid="guides-webinar-link">
      <span className="w-12 h-12 rounded-xl bg-red-500/15 text-red-300 grid place-items-center"><Icons.Video className="w-6 h-6" /></span>
      <div><p className="text-white font-semibold">Welcome webinar</p><p className="text-xs text-slate-400">Everything about the platform in one session</p></div>
    </Link>
    <GuidesGrid /></div>);
}

function Guide() {
  const { slug } = useParams();
  const { data: g, isLoading, error } = useQuery({ queryKey: ["guide", slug], queryFn: () => get(`/guides/${slug}`), refetchInterval: false });
  if (isLoading) return <Loader />;
  if (error) return <ErrorBox error={errMsg(error)} />;
  return (
    <div className="max-w-5xl mx-auto" data-testid="guide-page">
      <Link to="/app/guides" className="text-sm text-amber-400 inline-flex items-center gap-1 mb-4"><Icons.ArrowLeft className="w-4 h-4" />All guides</Link>
      <h1 className="font-display text-3xl text-white font-bold mb-2" data-testid="guide-title">{g.title}</h1><p className="text-slate-400 mb-5">{g.description}</p>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        {g.video_id ? <YTPlayer videoId={g.video_id} testid="guide-video" /> : <NoVideo />}
        <Glass><h3 className="font-semibold text-white mb-3">Step by step</h3>
          {g.steps.length ? <ol className="space-y-3">{g.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm text-slate-300"><span className="w-6 h-6 shrink-0 rounded-full bg-amber-500/15 text-amber-300 grid place-items-center text-xs font-bold">{i + 1}</span>{s}</li>)}</ol> : <Empty title="No steps yet" />}
        </Glass>
      </div>
    </div>
  );
}

export function WebinarGate() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: w } = useQuery({ queryKey: ["webinar"], queryFn: () => get("/webinar"), refetchInterval: false });
  const { user } = useAuth();
  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem(tourKey(user?.id)));
  useEffect(() => { const f = () => setTourDone(true); window.addEventListener("tour:done", f); return () => { window.removeEventListener("tour:done", f); }; }, []);
  const [skipAt, setSkipAt] = useState(() => Number(localStorage.getItem("webinar_skip_at") || 0));
  const skipped = Date.now() - skipAt < 3 * 3600 * 1000;
  const open = tourDone && !!w && w.enabled && !!w.video_id && !w.completed_at && !skipped && !loc.pathname.startsWith("/app/webinar");
  const skip = () => { const t = Date.now(); localStorage.setItem("webinar_skip_at", String(t)); setSkipAt(t); };
  const go = () => nav("/app/webinar");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) skip(); }}>
      <DialogContent className="bg-[#0C1120] border-amber-500/30 max-w-md p-0 overflow-hidden" data-testid="webinar-gate">
        <div role="button" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} className="cursor-pointer p-6 hover:bg-amber-500/5 transition-colors" data-testid="webinar-gate-card">
          <DialogHeader>
            <span className="w-14 h-14 mx-auto rounded-2xl bg-red-500/15 text-red-300 grid place-items-center mb-2"><Icons.Video className="w-7 h-7" /></span>
            <DialogTitle className="text-center">Watch the welcome webinar</DialogTitle>
            <DialogDescription className="text-center">{w?.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="btn-gold w-full mt-5" data-testid="webinar-gate-btn"><Icons.PlayCircle className="w-4 h-4" />Start webinar{w?.duration ? ` (${w.duration})` : ""}</div>
          <p className="text-center text-xs text-slate-500 mt-3">Tap anywhere on this card to open the webinar</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PAGES = { webinar: Webinar, guides: Guides, guide: Guide };
export default function Learn({ page }) {
  const P = PAGES[page];
  return <P />;
}
