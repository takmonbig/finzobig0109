import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Field, ErrorBox, PasswordInput, TelegramButton, useSite } from "@/components/common";
import { COUNTRIES } from "@/lib/countries";
import { track } from "@/lib/pixel";
import { Logo } from "@/components/PublicLayout";

const Shell = ({ title, subtitle, children }) => (
  <div className="min-h-screen mesh-bg grid place-items-center px-4 py-12">
    <div className="w-full max-w-md">
      <div className="flex justify-center mb-8"><Logo /></div>
      <div className="glass p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1 mb-6">{subtitle}</p>}
        {children}
      </div>
      <p className="text-center text-xs text-slate-500 mt-6 flex items-center justify-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Secured with encrypted sessions</p>
    </div>
  </div>
);

const Btn = ({ loading, children, testid }) => (
  <button type="submit" disabled={loading} className="btn-gold w-full" data-testid={testid}>{loading && <Loader2 className="w-4 h-4 animate-spin" />}{children}</button>
);

const goHome = (u) => (u.role === "super_admin" ? "/admin" : "/app");

export function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const { data: site } = useSite();
  const [err, setErr] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("email");
  const [cc, setCc] = useState("+91");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(z.object({ email: z.string().optional(), mobile: z.string().optional(), password: z.string().min(1, "Password required") })),
  });
  const done = (u) => { setUser(u); toast.success(`Welcome back, ${u.full_name}`); nav(goHome(u)); };
  const onSubmit = async (v) => {
    setErr(null);
    if (mode === "email" && !/^\S+@\S+\.\S+$/.test(v.email || "")) return setErr("Enter a valid email");
    if (mode === "mobile" && !/^\d{6,15}$/.test((v.mobile || "").replace(/\D/g, ""))) return setErr("Enter a valid mobile number");
    const body = mode === "email" ? { email: v.email.trim(), password: v.password } : { country_code: cc, mobile: v.mobile.replace(/\D/g, ""), password: v.password };
    try {
      const { data } = await api.post("/auth/login", body);
      data.requires_2fa ? setChallenge(data.challenge_token) : done(data);
    } catch (e) { setErr(errMsg(e)); }
  };
  const on2fa = async (e) => {
    e.preventDefault();
    setErr(null);
    try { done((await api.post("/auth/2fa/login", { challenge_token: challenge, code })).data); } catch (x) { setErr(errMsg(x)); }
  };
  if (challenge) return (
    <Shell title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={on2fa} className="space-y-4">
        <Input className="inp font-num text-center tracking-[0.5em] text-lg" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} data-testid="login-2fa-input" />
        <ErrorBox error={err} />
        <Btn testid="login-2fa-submit">Verify</Btn>
      </form>
    </Shell>
  );
  return (
    <Shell title="Sign in" subtitle="Access your account dashboard.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="login-form">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">{[["email", "Email"], ["mobile", "Mobile number"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} data-testid={`login-mode-${k}`} className={`py-2 rounded-lg text-sm transition-colors ${mode === k ? "bg-amber-500/20 text-amber-200" : "text-slate-400"}`}>{l}</button>))}</div>
        {mode === "email" ? <Field label="Email" error={errors.email?.message}><Input className="inp" type="email" autoComplete="email" autoCapitalize="none" {...register("email")} data-testid="login-email-input" /></Field> : (<>
          <Field label="Country"><select className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 h-10 text-base sm:text-sm" value={cc} onChange={(e) => setCc(e.target.value)} data-testid="login-country-select">
            {COUNTRIES.map(([n, d]) => <option key={n} value={d}>{`${n} (${d})`}</option>)}</select></Field>
          <Field label="Mobile number"><div className="flex gap-2"><span className="inp flex items-center px-3 rounded-xl border border-slate-700 font-num text-sm">{cc}</span><Input className="inp font-num" type="tel" inputMode="numeric" autoComplete="tel-national" {...register("mobile")} data-testid="login-mobile-input" /></div></Field></>)}
        <Field label="Password" error={errors.password?.message}><PasswordInput autoComplete="current-password" {...register("password")} testid="login-password-input" /></Field>
        <div className="text-right"><a href={site?.settings?.telegram?.url || "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline" data-testid="forgot-password-link">Forgot password? Contact support on Telegram</a></div>
        <ErrorBox error={err} />
        <Btn loading={isSubmitting} testid="login-submit-btn">Sign in</Btn>
        <p className="text-sm text-center text-slate-400">New here? <Link to="/register" className="text-amber-400" data-testid="goto-register-link">Create an account</Link></p>
      </form>
    </Shell>
  );
}

const regSchema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  country: z.string().min(2),
  email: z.string().email("Enter a valid email"),
  country_code: z.string().regex(/^\+\d{1,4}$/, "e.g. +91"),
  mobile: z.string().regex(/^\d{6,14}$/, "6–14 digits"),
  password: z.string().min(8, "Minimum 8 characters").regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
  confirm_password: z.string(),
  referral_code: z.string().optional(),
  accept_terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
}).refine((d) => d.password === d.confirm_password, { path: ["confirm_password"], message: "Passwords do not match" });

export function Register() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { setUser } = useAuth();
  const [err, setErr] = useState(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(regSchema), defaultValues: { country: "India", country_code: "+91", referral_code: sp.get("ref") || "" } });
  const country = watch("country");
  const [referrer, setReferrer] = useState(null);
  const refCode = watch("referral_code");
  useEffect(() => {
    const c = (refCode || "").trim();
    if (c.length < 6) { setReferrer(null); return undefined; }
    const t = setTimeout(() => { api.get(`/public/referrer/${encodeURIComponent(c)}`).then((r) => setReferrer(r.data.name)).catch(() => setReferrer(null)); }, 400);
    return () => { clearTimeout(t); };
  }, [refCode]);
  const onSubmit = async (v) => {
    setErr(null);
    try {
      const { data } = await api.post("/auth/register", v);
      setUser(data);
      toast.success("Account created. Welcome coins have been added.");
      track("CompleteRegistration");
      nav("/app/webinar");
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Shell title="Create account" subtitle="Join Finzo.cc in under a minute.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="register-form">
        <Field label="Full name" error={errors.full_name?.message}><Input className="inp" {...register("full_name")} data-testid="register-name-input" /></Field>
        <Field label="Email" error={errors.email?.message}><Input className="inp" type="email" {...register("email")} data-testid="register-email-input" /></Field>
        <Field label="Country"><select className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 h-10 text-sm" value={country} data-testid="register-country-select"
          onChange={(e) => { setValue("country", e.target.value); setValue("country_code", COUNTRIES.find((c) => c[0] === e.target.value)[1], { shouldValidate: true }); }}>
          {COUNTRIES.map(([n, d]) => <option key={n} value={n}>{`${n} (${d})`}</option>)}</select></Field>
        <div className="grid grid-cols-[90px_1fr] gap-3">
          <Field label="Code" error={errors.country_code?.message}><Input className="inp font-num" readOnly {...register("country_code")} data-testid="register-country-code-input" /></Field>
          <Field label="Mobile number" error={errors.mobile?.message}><Input className="inp font-num" inputMode="numeric" {...register("mobile")} data-testid="register-mobile-input" /></Field>
        </div>
        <Field label="Password" error={errors.password?.message}><PasswordInput autoComplete="new-password" {...register("password")} testid="register-password-input" /></Field>
        <Field label="Confirm password" error={errors.confirm_password?.message}><PasswordInput {...register("confirm_password")} testid="register-confirm-password-input" /></Field>
        <Field label="Referral code (optional)" error={errors.referral_code?.message}><Input className="inp font-num uppercase" readOnly={!!sp.get("ref")} {...register("referral_code")} data-testid="register-referral-input" /></Field>
        {referrer && <p className="text-xs text-emerald-300 -mt-2" data-testid="register-referrer">Invited by {referrer}</p>}
        <label className="flex gap-3 items-start text-sm text-slate-300">
          <input type="checkbox" className="mt-1 accent-amber-500" {...register("accept_terms")} data-testid="register-terms-checkbox" />
          <span>I accept the <Link to="/legal/terms" className="text-amber-400" target="_blank">Terms</Link> and <Link to="/legal/risk" className="text-amber-400" target="_blank">Risk Disclosure</Link>, and understand plan figures are not guaranteed.</span>
        </label>
        {errors.accept_terms && <p className="text-xs text-red-400">{errors.accept_terms.message}</p>}
        <ErrorBox error={err} />
        <Btn loading={isSubmitting} testid="register-submit-btn">Create account</Btn>
        <p className="text-sm text-center text-slate-400">Already registered? <Link to="/login" className="text-amber-400" data-testid="goto-login-link">Sign in</Link></p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  return (
    <Shell title="Reset your password" subtitle="Password resets are handled by our support team on Telegram.">
      <TelegramButton testid="forgot-telegram-btn" />
      <p className="text-sm text-center mt-4"><Link to="/login" className="text-amber-400">Back to sign in</Link></p>
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [state, setState] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return setState({ err: "Passwords do not match" });
    setState({ loading: true });
    try { await api.post("/auth/reset-password", { token: sp.get("token"), password: pw.a }); toast.success("Password updated. Please sign in."); nav("/login"); } catch (x) { setState({ err: errMsg(x) }); }
  };
  return (
    <Shell title="Choose a new password" subtitle="All other sessions will be signed out.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="Min 8 characters with letters and numbers"><PasswordInput value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} testid="reset-password-input" /></Field>
        <Field label="Confirm password"><PasswordInput value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} testid="reset-confirm-input" /></Field>
        <ErrorBox error={state.err} />
        <Btn loading={state.loading} testid="reset-submit-btn">Update password</Btn>
      </form>
    </Shell>
  );
}
