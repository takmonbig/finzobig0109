import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Wallet, Layers, ArrowDownToLine, ArrowUpFromLine, Network, Trophy, Bell, Megaphone, LifeBuoy, UserCog, Users, CreditCard, Gift,
  FileText, Settings, ScrollText, ShieldCheck, Landmark, MessageSquareWarning, PlayCircle, Video, Target, CalendarDays, UsersRound, Coins } from "lucide-react";
import { api } from "@/lib/api";
import { initPixels, track } from "@/lib/pixel";
import { LanguagePicker } from "@/components/Onboarding";
import { useParams } from "react-router-dom";

function RefRedirect() {
  const { code } = useParams();
  return <Navigate to={`/register?ref=${encodeURIComponent(code || "")}`} replace />;
}
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/common";
import PublicLayout from "@/components/PublicLayout";
import AppShell from "@/components/AppShell";
import Home from "@/pages/Home";
import RewardDetail, { LegalPage } from "@/pages/RewardDetail";
import { Login, Register, ForgotPassword, ResetPassword } from "@/pages/Auth";
import "@/App.css";

const U = lazy(() => import("@/pages/app/UserPages"));
const F = lazy(() => import("@/pages/app/Finance"));
const T = lazy(() => import("@/pages/app/TeamPages"));
const A = lazy(() => import("@/pages/admin/AdminCore"));
const AF = lazy(() => import("@/pages/admin/AdminFinance"));
const AC = lazy(() => import("@/pages/admin/AdminContent"));
const L = lazy(() => import("@/pages/app/Learn"));
const AL = lazy(() => import("@/pages/admin/AdminLearn"));
const ACT = lazy(() => import("@/pages/app/Activity"));
const ATR = lazy(() => import("@/pages/admin/AdminTeamRate"));
const CR = lazy(() => import("@/pages/app/CoinRewards"));
const ACR = lazy(() => import("@/pages/admin/AdminCoinRewards"));

function PixelTracker() {
  const loc = useLocation();
  const { data } = useQuery({ queryKey: ["pixels"], queryFn: () => api.get("/public/pixels").then((r) => r.data), refetchInterval: false, staleTime: Infinity });
  useEffect(() => { if (data) initPixels(data); }, [data]);
  useEffect(() => { if (data?.length) track("PageView"); }, [loc.pathname, data]);
  return null;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, refetchInterval: 20000, refetchIntervalInBackground: false } } });

const USER_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true }, { to: "/app/wallet", label: "Wallet & ledger", icon: Wallet },
  { to: "/app/deposit", label: "Deposit", icon: ArrowDownToLine }, { to: "/app/activity", label: "Activity calendar", icon: CalendarDays },
  { to: "/app/withdraw", label: "Withdrawal", icon: ArrowUpFromLine }, { to: "/app/team", label: "My team", icon: Network },
  { to: "/app/coin-rewards", label: "Coin rewards", icon: Coins },
  { to: "/app/rewards", label: "Rewards", icon: Trophy }, { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/announcements", label: "Team announcements", icon: Megaphone }, { to: "/app/support", label: "Support", icon: LifeBuoy },
  { to: "/app/profile", label: "Profile & security", icon: UserCog }, { to: "/app/webinar", label: "Welcome webinar", icon: Video },
  { to: "/app/guides", label: "Video guides", icon: PlayCircle },
];
const ADMIN_NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true }, { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/deposits", label: "Deposit verification", icon: ArrowDownToLine }, { to: "/admin/withdrawals", label: "Withdrawal review", icon: ArrowUpFromLine },
  { to: "/admin/payment-methods", label: "Payment methods", icon: CreditCard }, { to: "/admin/finance", label: "Ledger & liability", icon: Landmark },
  { to: "/admin/plans", label: "Plans", icon: Layers }, { to: "/admin/rewards", label: "Rewards & claims", icon: Gift },
  { to: "/admin/campaigns", label: "Notifications", icon: Bell }, { to: "/admin/team", label: "Team & moderation", icon: MessageSquareWarning },
  { to: "/admin/support", label: "Support tickets", icon: LifeBuoy }, { to: "/admin/cms", label: "Website CMS", icon: FileText },
  { to: "/admin/settings", label: "System settings", icon: Settings }, { to: "/admin/logs", label: "Audit & security", icon: ScrollText },
  { to: "/admin/learn", label: "Webinar & guides", icon: Video }, { to: "/admin/pixels", label: "Meta Pixels", icon: Target },
  { to: "/admin/team-rate", label: "Team section & coin rate", icon: UsersRound },
  { to: "/admin/coin-rewards", label: "Coin rewards", icon: Coins },
];

function Guard({ role, children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen mesh-bg"><Loader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin" && user.role !== "super_admin") return <Navigate to="/app" replace />;
  if (role === "user" && user.role === "super_admin") return <Navigate to="/admin" replace />;
  return children;
}

const S = (el) => <Suspense fallback={<Loader />}>{el}</Suspense>;

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/rewards/:slug" element={<RewardDetail />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/r/:code" element={<RefRedirect />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/app" element={<Guard role="user"><AppShell items={USER_NAV} area="user" /></Guard>}>
        <Route index element={S(<U page="overview" />)} />
        <Route path="wallet" element={S(<F page="wallet" />)} />
        <Route path="plans" element={<Navigate to="/app/deposit" replace />} />
        <Route path="activity" element={S(<ACT />)} />
        <Route path="coin-rewards" element={S(<CR />)} />
        <Route path="deposit" element={S(<F page="deposit" />)} />
        <Route path="withdraw" element={S(<F page="withdraw" />)} />
        <Route path="team" element={S(<T page="team" />)} />
        <Route path="announcements" element={S(<T page="announcements" />)} />
        <Route path="rewards" element={S(<U page="rewards" />)} />
        <Route path="notifications" element={S(<U page="notifications" />)} />
        <Route path="support" element={S(<U page="support" />)} />
        <Route path="profile" element={S(<U page="profile" />)} />
        <Route path="webinar" element={S(<L page="webinar" />)} />
        <Route path="guides" element={S(<L page="guides" />)} />
        <Route path="guides/:slug" element={S(<L page="guide" />)} />
      </Route>
      <Route path="/admin" element={<Guard role="admin"><AppShell items={ADMIN_NAV} area="admin" /></Guard>}>
        <Route index element={S(<A page="overview" />)} />
        <Route path="users" element={S(<A page="users" />)} />
        <Route path="team" element={S(<A page="team" />)} />
        <Route path="logs" element={S(<A page="logs" />)} />
        <Route path="deposits" element={S(<AF page="deposits" />)} />
        <Route path="withdrawals" element={S(<AF page="withdrawals" />)} />
        <Route path="payment-methods" element={S(<AF page="methods" />)} />
        <Route path="finance" element={S(<AF page="finance" />)} />
        <Route path="plans" element={S(<AC page="plans" />)} />
        <Route path="rewards" element={S(<AC page="rewards" />)} />
        <Route path="campaigns" element={S(<AC page="campaigns" />)} />
        <Route path="support" element={S(<AC page="support" />)} />
        <Route path="cms" element={S(<AC page="cms" />)} />
        <Route path="settings" element={S(<AC page="settings" />)} />
        <Route path="learn" element={S(<AL page="learn" />)} />
        <Route path="pixels" element={S(<AL page="pixels" />)} />
        <Route path="team-rate" element={S(<ATR />)} />
        <Route path="coin-rewards" element={S(<ACR />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter><PixelTracker /><LanguagePicker /><div id="gt-el" className="hidden" /><AppRoutes /></BrowserRouter>
        <Toaster theme="dark" richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export { ShieldCheck };
