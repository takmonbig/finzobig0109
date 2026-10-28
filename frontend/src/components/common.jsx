import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Send, UploadCloud, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { api, uploadImage, validateImage } from "@/lib/api";
import { tokenize, isExternal } from "@/lib/linkify";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

export const useSite = () => useQuery({ queryKey: ["site"], queryFn: () => api.get("/public/site").then((r) => r.data), staleTime: 60000 });

export const PasswordInput = forwardRef(function PasswordInput({ className = "", wrapperClassName = "", testid, ...p }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <Input ref={ref} type={show ? "text" : "password"} className={`inp pr-10 ${className}`} data-testid={testid} {...p} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} data-testid={`${testid}-toggle`}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
    </div>
  );
});

export const Glass = ({ className = "", children, ...p }) => <div className={`glass p-5 sm:p-6 ${className}`} {...p}>{children}</div>;

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white" data-testid="page-title">{title}</h1>
      {subtitle && <p className="text-sm text-slate-400 mt-1 max-w-2xl">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Stat = ({ label, value, icon: Icon, hint, testid, tone = "amber" }) => {
  const tones = { amber: "text-amber-400 bg-amber-500/10", blue: "text-blue-400 bg-blue-500/10", violet: "text-violet-400 bg-violet-500/10", emerald: "text-emerald-400 bg-emerald-500/10" };
  return (
    <div className="glass glass-hover p-5" data-testid={testid}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <span className={`p-2 rounded-lg ${tones[tone]}`}><Icon className="w-4 h-4" /></span>}
      </div>
      <p className="font-num text-2xl font-semibold text-white mt-2" data-testid={`${testid}-value`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
};

export const Loader = ({ label = "Loading…" }) => (
  <div className="flex items-center gap-2 text-slate-400 py-10 justify-center" data-testid="loading-state"><Loader2 className="w-4 h-4 animate-spin" />{label}</div>
);

export const Empty = ({ title = "Nothing here yet", text }) => (
  <div className="text-center py-12 text-slate-400" data-testid="empty-state">
    <Inbox className="w-8 h-8 mx-auto mb-3 text-slate-600" />
    <p className="font-semibold text-slate-300">{title}</p>
    {text && <p className="text-sm mt-1">{text}</p>}
  </div>
);

export const ErrorBox = ({ error }) => error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm p-3" data-testid="error-state">{error}</div> : null;

const STATUS = {
  verified: "emerald", completed: "emerald", active: "emerald", approved: "emerald", fulfilled: "emerald", sent: "emerald", delivered: "emerald", answered: "blue",
  pending_verification: "amber", submitted: "amber", under_review: "amber", processing: "blue", pending_review: "amber", pending: "amber", scheduled: "blue", sending: "blue", open: "amber",
  rejected: "red", failed: "red", cancelled: "slate", refunded: "violet", suspended: "red", disabled: "slate", closed: "slate", removed: "red", draft: "slate",
};
const TONE = { emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", amber: "bg-amber-500/10 text-amber-300 border-amber-500/30", blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  red: "bg-red-500/10 text-red-300 border-red-500/30", violet: "bg-violet-500/10 text-violet-300 border-violet-500/30", slate: "bg-slate-500/10 text-slate-300 border-slate-500/30" };

export const StatusBadge = ({ status, testid }) => (
  <span data-testid={testid} className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border whitespace-nowrap ${TONE[STATUS[status] || "slate"]}`}>{String(status || "").replace(/_/g, " ")}</span>
);

const RANK_TONE = { Bronze: "text-orange-300 border-orange-400/40 bg-orange-500/10", Silver: "text-slate-200 border-slate-300/40 bg-slate-400/10", Gold: "text-amber-300 border-amber-400/50 bg-amber-500/10",
  Platinum: "text-cyan-200 border-cyan-300/40 bg-cyan-500/10", Diamond: "text-violet-200 border-violet-400/50 bg-violet-500/15", Member: "text-slate-400 border-slate-600 bg-slate-800/40" };
export const RankBadge = ({ rank, testid }) => <span data-testid={testid} className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${RANK_TONE[rank] || RANK_TONE.Member}`}>{rank || "Member"}</span>;

export const DemoTag = ({ text = "Hypothetical" }) => <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-violet-400/40 text-violet-300 bg-violet-500/10">{text}</span>;

export const Field = ({ label, error, children, hint }) => (
  <label className="block space-y-1.5">
    <span className="text-sm text-slate-300 font-medium">{label}</span>
    {children}
    {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
    {error && <span className="block text-xs text-red-400">{error}</span>}
  </label>
);

export function Pager({ page, size, total, onPage, testid = "pager" }) {
  const pages = Math.max(1, Math.ceil((total || 0) / size));
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-slate-400" data-testid={testid}>
      <span>{total || 0} records · page {page} of {pages}</span>
      <div className="flex gap-2">
        <button className="btn-ghost !px-2.5 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid={`${testid}-prev`}><ChevronLeft className="w-4 h-4" /></button>
        <button className="btn-ghost !px-2.5 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid={`${testid}-next`}><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

export function Confirm({ trigger, title, description, onConfirm, confirmLabel = "Confirm", testid = "confirm" }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="bg-[#0C1120] border-amber-500/20">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`${testid}-cancel`}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-amber-500 text-slate-950 hover:bg-amber-400" data-testid={`${testid}-ok`}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ImageUpload({ sigPath, sigBody, onUploaded, testid = "image-upload", label = "Upload image", value }) {
  const [preview, setPreview] = useState(value || null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const onFile = async (file) => {
    const bad = validateImage(file, sigPath.includes("admin") ? 8 : 5);
    if (bad) return setError(bad);
    setError(null);
    setPreview(URL.createObjectURL(file));
    setState("uploading");
    try {
      const r = await uploadImage(file, sigPath, sigBody, setProgress);
      setState("done");
      onUploaded(r);
    } catch (e) {
      setState("error");
      setError(e?.response?.data?.error?.message || e?.response?.data?.detail || e.message || "Upload failed");
      onUploaded(null);
    }
  };
  return (
    <div className="space-y-2" data-testid={testid}>
      <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-slate-600 hover:border-amber-500/60 rounded-xl p-4 cursor-pointer bg-slate-950/40 transition-colors">
        {preview ? <img src={preview} alt="Preview" className="max-h-48 rounded-lg object-contain" data-testid={`${testid}-preview`} /> : <UploadCloud className="w-7 h-7 text-amber-400" />}
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-xs text-slate-500">JPG, PNG or WEBP · max {sigPath.includes("admin") ? 8 : 5} MB</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid={`${testid}-input`} />
      </label>
      {state === "uploading" && <Progress value={progress} className="h-1.5" />}
      {state === "done" && <p className="text-xs text-emerald-400" data-testid={`${testid}-success`}>Uploaded securely</p>}
      {error && <p className="text-xs text-red-400" data-testid={`${testid}-error`}>{error}</p>}
    </div>
  );
}

export function LinkText({ text, onLink, className = "" }) {
  const [pending, setPending] = useState(null);
  const open = (href) => {
    onLink && onLink(href);
    if (isExternal(href)) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  };
  return (
    <>
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        {tokenize(text).map((p, i) => p.type === "text" ? <span key={i}>{p.value}</span> : (
          <a key={i} href={p.href} rel="noopener noreferrer nofollow" target="_blank" data-testid="message-link"
            className="text-amber-300 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-200 break-all"
            onClick={(e) => { e.preventDefault(); isExternal(p.href) ? setPending(p.href) : open(p.href); }}>{p.value}</a>
        ))}
      </span>
      <ExternalPreview href={pending} onClose={() => setPending(null)} onGo={() => { open(pending); setPending(null); }} />
    </>
  );
}

export function ExternalPreview({ href, onClose, onGo }) {
  let host = "";
  try { host = href ? new URL(href).hostname : ""; } catch { host = ""; }
  return (
    <Dialog open={!!href} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0C1120] border-amber-500/20 max-w-md" data-testid="external-link-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ExternalLink className="w-4 h-4 text-amber-400" />You are leaving the platform</DialogTitle>
          <DialogDescription>This link opens an external website. Check the destination before continuing.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-slate-950/70 border border-slate-700 p-3">
          <p className="text-xs text-slate-500">Destination</p>
          <p className="font-semibold text-white" data-testid="external-link-host">{host}</p>
          <p className="font-num text-xs text-slate-400 break-all mt-1">{href}</p>
        </div>
        <DialogFooter className="gap-2">
          <button className="btn-ghost" onClick={onClose} data-testid="external-link-cancel">Stay here</button>
          <button className="btn-gold" onClick={onGo} data-testid="external-link-continue">Open link</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TelegramButton({ testid = "telegram-support-btn", className = "" }) {
  const { data } = useSite();
  const t = data?.settings?.telegram;
  if (!t?.url) return null;
  const href = `${t.url}${t.default_message ? `?text=${encodeURIComponent(t.default_message)}` : ""}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testid}
      className={`flex items-center gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 px-4 py-3 transition-colors ${className}`}>
      <span className="p-2 rounded-lg bg-sky-500 text-white"><Send className="w-4 h-4" /></span>
      <span className="text-left"><span className="block font-semibold text-sky-200">{t.button_text}</span><span className="block text-xs text-slate-400">{t.availability}</span></span>
    </a>
  );
}
