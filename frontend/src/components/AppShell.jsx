import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, ChevronsLeft, LogOut, Menu, ShieldAlert, X, ExternalLink } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { permission, laterActive, remindLater, enablePush } from "@/lib/push";
import { isExternal } from "@/lib/linkify";
import { useAuth } from "@/context/AuthContext";
import { LinkText, ExternalPreview, RankBadge } from "@/components/common";
import { Logo } from "@/components/PublicLayout";
import { InstallButton, InstallPopup, TrustBadge } from "@/components/Pwa";
import { WebinarGate } from "@/pages/app/Learn";
import { LangSwitcher, WelcomeTour } from "@/components/Onboarding";

function useRealtime(enabled) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    let ws, timer, stop = false, delay = 2000;
    const connect = () => {
      const url = `${process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws")}/api/ws`;
      ws = new WebSocket(url);
      ws.onopen = () => { delay = 2000; };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data || "{}");
        if (msg.type === "notification") {
          qc.invalidateQueries();
          if (!msg.data.popup) toast(msg.data.title, { description: msg.data.message?.slice(0, 120) });
        }
      };
      ws.onclose = () => { if (!stop) timer = setTimeout(connect, (delay = Math.min(delay * 2, 30000))); };
    };
    connect();
    return () => { stop = true; clearTimeout(timer); ws && ws.close(); };
  }, [enabled, qc]);
}

function NotificationPrompt({ user }) {
  const [state, setState] = useState(() => permission());
  const [hidden, setHidden] = useState(() => laterActive() || sessionStorage.getItem("push_denied_seen") === "1");
  const [busy, setBusy] = useState(false);
  if (hidden || !user || user.prefs?.push_reminders === false || state === "granted" || state === "unsupported") return null;
  if (state === "denied") return (
    <div className="glass p-4 mb-6 flex gap-3 items-start border-red-500/30" data-testid="push-denied-help">
      <BellOff className="w-5 h-5 text-red-300 shrink-0" />
      <div className="text-sm text-slate-300 flex-1">Browser notifications are blocked. To enable them, click the lock icon in your address bar → Site settings → Notifications → Allow, then reload this page.</div>
      <button onClick={() => { sessionStorage.setItem("push_denied_seen", "1"); setHidden(true); }} data-testid="push-denied-dismiss"><X className="w-4 h-4" /></button>
    </div>
  );
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); toast.success("Notifications enabled"); } catch (e) { toast.error(errMsg(e)); }
    setState(permission());
    setBusy(false);
  };
  return (
    <div className="glass p-4 sm:p-5 mb-6 flex flex-col sm:flex-row gap-4 sm:items-center border-amber-500/30" data-testid="push-permission-prompt">
      <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 self-start"><Bell className="w-5 h-5" /></span>
      <div className="flex-1">
        <p className="font-semibold text-white">Stay informed about your account</p>
        <p className="text-sm text-slate-400">Get browser alerts for payment record updates, rank changes and announcements. You can turn this off any time in your profile.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => { remindLater(); setHidden(true); }} data-testid="push-maybe-later-btn">Maybe Later</button>
        <button className="btn-gold" disabled={busy} onClick={enable} data-testid="push-enable-btn">Enable Notifications</button>
      </div>
    </div>
  );
}

function PopupAnnouncements() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["popups"], queryFn: () => api.get("/notifications/popups").then((r) => r.data), refetchInterval: 120000 });
  const [ext, setExt] = useState(null);
  const n = data[0];
  const close = async () => { await api.post(`/notifications/${n.id}/popup-seen`); qc.invalidateQueries({ queryKey: ["popups"] }); };
  const track = () => api.post(`/notifications/${n.id}/click`).catch(() => {});
  const cta = () => { track(); if (isExternal(n.link)) setExt(n.link); else { close(); window.location.assign(n.link); } };
  if (!n) return null;
  return (
    <>
      <Dialog open={!!n && !ext} onOpenChange={(o) => !o && close()}>
        <DialogContent className="bg-[#0C1120] border-amber-500/30 max-w-lg" data-testid="popup-announcement">
          {n.image_url && <img src={n.image_url} alt="" className="w-full max-h-56 object-cover rounded-xl" data-testid="popup-image" />}
          <DialogHeader>
            <DialogTitle className="font-display text-xl" data-testid="popup-title">{n.title}</DialogTitle>
            <DialogDescription asChild><div className="text-slate-300 text-sm" data-testid="popup-message"><LinkText text={n.message} onLink={track} /></div></DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={close} data-testid="popup-close-btn">Close</button>
            {n.link && <button className="btn-gold" onClick={cta} data-testid="popup-cta-btn">{n.cta_label || "Open"} <ExternalLink className="w-4 h-4" /></button>}
          </div>
        </DialogContent>
      </Dialog>
      <ExternalPreview href={ext} onClose={() => { setExt(null); close(); }} onGo={() => { window.open(ext, "_blank", "noopener,noreferrer"); setExt(null); close(); }} />
    </>
  );
}

function Nav({ items, collapsed, onNav }) {
  return (
    <nav className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNav} data-testid={`sidebar-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`} title={label}
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${isActive ? "bg-amber-500/10 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent"}`}>
          <Icon className="w-4 h-4 shrink-0" />{!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ items, area }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sb_collapsed") === "1");
  const [mobile, setMobile] = useState(false);
  const mounted = useRef(false);
  useRealtime(!!user);
  useEffect(() => { if (mounted.current) localStorage.setItem("sb_collapsed", collapsed ? "1" : "0"); mounted.current = true; }, [collapsed]);
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api.get("/notifications", { params: { size: 1 } }).then((r) => r.data.unread), refetchInterval: 60000 });
  const doLogout = async () => { await logout(); nav("/login"); };
  return (
    <div className={`min-h-screen mesh-bg flex text-slate-200 ${area === "admin" ? "notranslate" : ""}`} translate={area === "admin" ? "no" : undefined}>
      <aside className={`hidden lg:flex flex-col sticky top-0 h-screen bg-[#070A12]/95 backdrop-blur-2xl border-r border-slate-800/80 p-4 transition-[width] duration-300 ${collapsed ? "w-[76px]" : "w-64"}`} data-testid="sidebar">
        <div className="flex items-center justify-between mb-8">{!collapsed && <Logo />}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400" data-testid="sidebar-collapse-btn" aria-label="Collapse sidebar"><ChevronsLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} /></button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1"><Nav items={items} collapsed={collapsed} /></div>
        <button onClick={doLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-300 hover:bg-red-500/10 mt-4" data-testid="sidebar-logout-btn"><LogOut className="w-4 h-4" />{!collapsed && "Sign out"}</button>
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="bg-[#070A12] border-slate-800 w-72 p-4 overflow-y-auto" data-testid="mobile-sidebar">
          <div className="mb-6"><Logo /></div>
          <Nav items={items} onNav={() => setMobile(false)} />
          <button onClick={doLogout} className="btn-ghost w-full mt-6" data-testid="mobile-logout-btn"><LogOut className="w-4 h-4" />Sign out</button>
        </SheetContent>
      </Sheet>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-[#070A12]/80 backdrop-blur-xl border-b border-slate-800/80 flex items-center gap-3 px-4 sm:px-6">
          <button className="lg:hidden p-2 -ml-2" onClick={() => setMobile(true)} data-testid="mobile-nav-toggle" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
          {area === "admin" && <span className="text-[11px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-400/40 text-amber-200">Super Admin</span>}
          <div className="flex-1" />
          {area === "user" && <LangSwitcher />}
          <InstallButton />
          <Link to={area === "admin" ? "/admin/campaigns" : "/app/notifications"} className="relative p-2 rounded-xl hover:bg-slate-800" data-testid="topbar-notifications-btn" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            {unread.data > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold grid place-items-center" data-testid="unread-count">{unread.data}</span>}
          </Link>
          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="text-right"><p className="text-sm text-white leading-tight" data-testid="topbar-user-name">{user?.full_name}</p><p className="text-xs text-slate-500">{user?.email}</p></div>
            {area !== "admin" && <RankBadge rank={user?.rank} testid="topbar-rank" />}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {area === "user" && <NotificationPrompt user={user} />}
          <Outlet />
        </main>
        <footer className="px-4 py-4 flex justify-center border-t border-slate-800/60"><TrustBadge /></footer>
        {area === "user" && <InstallPopup />}
        {area === "user" && <WebinarGate />}
        {area === "user" && user && <WelcomeTour user={user} />}
      </div>
      <PopupAnnouncements />
    </div>
  );
}
