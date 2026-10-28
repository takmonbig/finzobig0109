import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { InstallButton, TrustBadge } from "@/components/Pwa";
import { LangSwitcher } from "@/components/Onboarding";
import { Menu, X, ShieldAlert } from "lucide-react";
import { useSite } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

const NAV = [["Benefits", "/#benefits"], ["Plans", "/#plans"], ["How it works", "/#how"], ["Markets", "/#markets"], ["Team", "/#team"], ["Team bonus", "/#team-bonus"], ["Referral bonus", "/#referral-bonus"], ["Rewards", "/#rewards"], ["FAQ", "/#faq"]];
const FOOT = [["About Us", "about"], ["Contact", "contact"], ["Support", "support"], ["Privacy Policy", "privacy"], ["Terms and Conditions", "terms"], ["Risk Disclosure", "risk"],
  ["Refund Policy", "refund"], ["Complaint Resolution", "complaints"], ["Cookie Preferences", "cookies"], ["Company Information", "company"]];

export const Logo = ({ name = "Finzo.cc" }) => (
  <Link to="/" className="flex items-center" data-testid="brand-logo">
    <img src="/img/logo.png" alt={name} className="h-12 sm:h-14 w-auto object-contain" />
  </Link>
);

function TopNav({ name }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const dash = user?.role === "super_admin" ? "/admin" : "/app";
  return (
    <header className="sticky top-0 z-40 bg-[#070A12]/80 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Logo name={name} />
        <nav className="hidden lg:flex items-center gap-6 text-sm text-slate-300">
          {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-amber-300 transition-colors whitespace-nowrap" data-testid={`nav-${l.toLowerCase().replace(/ /g, "-")}`}>{l}</a>)}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <LangSwitcher />
          <InstallButton />
          {user ? <Link to={dash} className="btn-gold" data-testid="nav-dashboard-btn">Open dashboard</Link> : (<>
            <Link to="/login" className="text-sm text-slate-300 hover:text-white whitespace-nowrap" data-testid="nav-login-btn">Sign in</Link>
            <Link to="/register" className="btn-gold !py-2 whitespace-nowrap" data-testid="nav-register-btn">Create Account</Link></>)}
        </div>
        <button className="lg:hidden p-2 text-slate-200" onClick={() => setOpen(!open)} aria-label="Menu" data-testid="mobile-menu-toggle">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-slate-800 bg-[#070A12] px-4 py-4 space-y-1" data-testid="mobile-menu">
          <div className="pb-2"><LangSwitcher /></div>
          {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block py-3 text-slate-200 border-b border-slate-800/60">{l}</a>)}
          <div className="flex gap-3 pt-3">
            {user ? <Link to={dash} className="btn-gold flex-1">Dashboard</Link> : (<>
              <Link to="/login" className="btn-ghost flex-1" data-testid="mobile-login-btn">Sign in</Link>
              <Link to="/register" className="btn-gold flex-1" data-testid="mobile-register-btn">Create Account</Link></>)}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer({ site }) {
  const c = site?.content?.footer || {};
  const s = site?.settings || {};
  return (
    <footer className="border-t border-slate-800 bg-[#05070d] mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-[1.3fr_2fr]">
        <div className="space-y-4">
          <Logo name={s.site_name} />
          <p className="text-sm text-slate-400 max-w-sm">{c.about}</p>
          <p className="text-xs text-slate-500">{c.note}</p>
          <p className="text-xs text-slate-500">Contact: {s.contact?.email}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {FOOT.map(([l, slug]) => <Link key={slug} to={`/legal/${slug}`} className="text-slate-400 hover:text-amber-300 transition-colors" data-testid={`footer-${slug}`}>{l}</Link>)}
        </div>
      </div>
      <div className="border-t border-slate-800/70 py-5 px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-3">
        <TrustBadge /><span>© {new Date().getFullYear()} {s.site_name}</span><span data-testid="footer-trading-control">Trading control by Finzo.cc</span>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const { data } = useSite();
  const loc = useLocation();
  const banner = data?.content?.banners?.find((b) => b.active);
  return (
    <div className="min-h-screen mesh-bg grain text-slate-200" key={loc.pathname === "/" ? "home" : "page"}>
      {banner && <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs sm:text-sm text-center py-2 px-4" data-testid="site-banner">{banner.text}</div>}
      <TopNav name={data?.settings?.site_name || "Finzo.cc"} />
      <main className="relative z-10"><Outlet /></main>
      <Footer site={data} />
    </div>
  );
}
