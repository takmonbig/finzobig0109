import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check, Info, ShieldAlert } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, coins, errMsg, fdate, newKey } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { track } from "@/lib/pixel";
import { Glass, PageHeader, Loader, Empty, ErrorBox, StatusBadge, Field, Pager, Confirm, ImageUpload, TelegramButton, Stat } from "@/components/common";

const get = (url, params) => api.get(url, { params }).then((r) => r.data);

const ACC_LABEL = { all: "All", verified: "USDT", demo_coins: "Coins", sim_earnings: "Plan earnings", promo: "Promo", referral_coins: "Referral coins" };

function Wallet() {
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ["wallet", account, page], queryFn: () => get("/wallet", { account: account || undefined, page, size: 20 }) });
  return (
    <div data-testid="wallet-page">
      <PageHeader title="Wallet & ledger" subtitle="Every entry is immutable. Corrections appear as separate reversing entries. Coins and USDT are kept in separate accounts." />
      {isLoading ? <Loader /> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Object.entries(data.wallets).map(([k, w]) => <Stat key={k} label={w.label} value={coins(w.available)} testid={`wallet-${k}`} hint={w.reserved ? `${coins(w.reserved)} reserved` : `Balance ${coins(w.balance)}`} />)}
        </div>
        <Tabs value={account || "all"} onValueChange={(v) => { setAccount(v === "all" ? "" : v); setPage(1); }}>
          <TabsList className="bg-slate-900 flex-wrap h-auto">{["all", "verified", "demo_coins", "sim_earnings", "promo"].map((a) => <TabsTrigger key={a} value={a} data-testid={`ledger-tab-${a}`}>{ACC_LABEL[a]}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Glass className="mt-4">
          {data.ledger.items.length ? <div className="overflow-x-auto"><table className="tbl" data-testid="ledger-table"><thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Memo</th><th className="text-right">Amount</th><th className="text-right">Balance after</th></tr></thead>
            <tbody>{data.ledger.items.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{fdate(e.created_at)}</td><td>{ACC_LABEL[e.account] || e.account}</td><td>{e.type}</td><td>{e.memo}</td>
              <td className={`text-right font-num ${e.amount < 0 ? "text-red-300" : "text-emerald-300"}`}>{e.amount > 0 ? "+" : ""}{coins(e.amount)}</td><td className="text-right font-num">{coins(e.balance_after)}</td></tr>)}</tbody></table></div> : <Empty title="No ledger entries" />}
          <Pager page={page} size={20} total={data.ledger.total} onPage={setPage} />
        </Glass>
      </>)}
    </div>
  );
}

function CopyBtn({ text, testid }) {
  const [ok, setOk] = useState(false);
  return <button className="btn-ghost !py-1.5 !px-3 text-xs" data-testid={testid} onClick={async () => { await navigator.clipboard.writeText(text); setOk(true); toast.success("Copied"); setTimeout(() => setOk(false), 1500); }}>{ok ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{ok ? "Copied" : "Copy"}</button>;
}

const REF_HINT = { usdt_trc20: "64-character transaction hash", usdt_bep20: "0x + 64-character transaction hash" };

function PayStep({ d, onDone }) {
  const [f, setF] = useState({ reference: "", note: "" });
  const [ev, setEv] = useState(null);
  const [err, setErr] = useState(null);
  const mut = useMutation({
    mutationFn: () => api.post(`/deposits/${d.id}/submit`, { reference: f.reference, evidence_public_id: ev?.public_id, note: f.note || null }),
    onSuccess: (r) => { const s = r.data.status; s === "verified" ? toast.success("Deposit confirmed and credited") : s === "failed" ? toast.error(r.data.status_note) : toast.success("Submitted. Waiting for on-chain confirmation."); onDone(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const submit = () => {
    if (!/^(0x)?[a-fA-F0-9]{64}$/.test(f.reference.trim())) return setErr("Enter a valid 64-character transaction hash");
    if (!ev) return setErr("Payment screenshot is required");
    setErr(null); mut.mutate();
  };
  return (
    <div className="space-y-4" data-testid="deposit-pay-step">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="text-xs text-amber-200">Send exactly</p>
        <div className="flex items-center gap-2"><p className="font-num text-2xl text-white" data-testid="deposit-exact-amount">{d.expected_display} USDT</p><CopyBtn text={d.expected_display} testid="copy-amount-btn" /></div>
        <p className="text-xs text-slate-400 mt-1">on {d.network} to the address shown. The exact amount identifies your deposit. Request expires {fdate(d.expires_at)}.</p>
      </div>
      <Field label="Transaction hash (TxID)" hint={REF_HINT[d.method_type]}><Input className="inp font-num" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} data-testid="deposit-reference-input" /></Field>
      <Field label="Payment screenshot (required)"><ImageUpload sigPath="/uploads/signature" sigBody={{ purpose: "evidence" }} onUploaded={setEv} testid="deposit-screenshot" label="Upload payment screenshot" /></Field>
      <Field label="Note (optional)"><Input className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="deposit-note-input" /></Field>
      <p className="text-xs text-slate-500 flex gap-2"><Info className="w-4 h-4 shrink-0" />Your deposit is credited automatically once the transaction is confirmed on the blockchain. The screenshot is kept as supporting evidence only.</p>
      <ErrorBox error={err} />
      <button className="btn-gold w-full" disabled={mut.isPending} onClick={submit} data-testid="deposit-submit-btn">{mut.isPending ? "Checking blockchain…" : "Submit transaction"}</button>
    </div>
  );
}

function DepositForm({ m, open, onDone }) {
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState(null);
  const mut = useMutation({
    mutationFn: () => api.post("/deposits", { method_id: m.id, amount: Number(amount) }),
    onSuccess: () => { track("InitiateCheckout", { currency: "USD", value: Number(amount) }); setAmount(""); setErr(null); onDone(); },
    onError: (e) => setErr(errMsg(e)),
  });
  if (open) return <PayStep d={open} onDone={onDone} />;
  const presets = [50, 100, 250, 500, 1000, 2500, 5000, 10000].filter((v) => v * 100 >= m.min_amount && v * 100 <= m.max_amount);
  return (
    <div className="space-y-4" data-testid="deposit-form">
      <div><p className="text-sm text-slate-300 mb-2">Choose an amount</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{presets.map((v) => (
          <button key={v} type="button" onClick={() => setAmount(String(v))} data-testid={`deposit-preset-${v}`}
            className={`py-2.5 rounded-xl border text-sm font-num transition-colors ${Number(amount) === v ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>{v.toLocaleString()}</button>))}</div></div>
      <Field label="Amount (USDT)" hint={`Min ${coins(m.min_amount, 0)} · Max ${coins(m.max_amount, 0)}`}><Input className="inp font-num" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="deposit-amount-input" /></Field>
      <ErrorBox error={err} />
      <button className="btn-gold w-full" disabled={mut.isPending} onClick={() => (!amount || Number(amount) <= 0 ? setErr("Enter a valid amount") : mut.mutate())} data-testid="deposit-create-btn">{mut.isPending ? "Creating…" : "Continue to payment"}</button>
    </div>
  );
}

function Deposit() {
  const qc = useQueryClient();
  const methods = useQuery({ queryKey: ["methods"], queryFn: () => get("/payment-methods") });
  const [page, setPage] = useState(1);
  const hist = useQuery({ queryKey: ["deposits", page], queryFn: () => get("/deposits", { page, size: 10 }), refetchInterval: (q) => (q.state.data?.items?.some((d) => d.status === "pending_verification") ? 15000 : false) });
  const [sel, setSel] = useState(null);
  const m = sel || methods.data?.[0];
  const open = hist.data?.items.find((d) => d.status === "draft" && d.method_id === m?.id && d.expires_at > new Date().toISOString());
  const refresh = () => ["deposits", "dashboard", "wallet"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const recheck = useMutation({ mutationFn: (id) => api.post(`/deposits/${id}/recheck`), onSuccess: (r) => { toast(r.data.status_note); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div data-testid="deposit-page">
      <PageHeader title="Deposit USDT" subtitle="Send USDT on the selected network, then submit the transaction hash. Deposits are credited to your USDT balance after on-chain confirmation." />
      {methods.isLoading ? <Loader /> : !methods.data?.length ? <Empty title="No payment methods available" /> : (
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">{methods.data.map((x) => <button key={x.id} onClick={() => setSel(x)} data-testid={`method-${x.type}`}
              className={`px-4 py-2 rounded-xl text-sm border transition-colors ${m?.id === x.id ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>{x.name}</button>)}</div>
            <Glass className="space-y-4" data-testid="method-details">
              <div><p className="text-xs text-slate-500">Network</p><p className="text-white font-semibold" data-testid="method-network">{m.network}</p></div>
              <div><p className="text-xs text-slate-500">Wallet address</p>
                <div className="flex items-center gap-2 mt-1"><p className="font-num text-sm text-amber-200 break-all flex-1" data-testid="method-address">{m.address}</p><CopyBtn text={m.address} testid="copy-address-btn" /></div></div>
              <div className="bg-white rounded-xl p-3 w-fit mx-auto" data-testid="method-qr">{m.qr_url ? <img src={m.qr_url} alt="Payment QR" className="w-44 h-44 object-contain" /> : <QRCodeSVG value={m.address} size={176} />}</div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap" data-testid="method-instructions">{m.instructions}</p>
              <p className="text-xs text-amber-200/80 flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />Send only USDT on {m.network}. Transfers on the wrong network or of another token cannot be recovered.</p>
            </Glass>
            <TelegramButton testid="deposit-telegram-btn" />
          </div>
          <Glass><DepositForm m={m} open={open} onDone={refresh} /></Glass>
        </div>
      )}
      <Glass className="mt-6" data-testid="deposit-history">
        <h3 className="font-semibold text-white mb-3">Deposits</h3>
        {hist.data?.items.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Transaction</th><th>Status</th><th>Explanation</th><th /></tr></thead>
          <tbody>{hist.data.items.map((d) => <tr key={d.id}><td className="whitespace-nowrap">{fdate(d.created_at)}</td><td>{d.method_name}</td><td className="font-num">{d.expected_display || coins(d.amount)} USDT</td>
            <td className="font-num text-xs break-all max-w-[180px]">{d.reference || "—"}</td><td><StatusBadge status={d.status} testid={`deposit-status-${d.id}`} /></td><td className="text-xs text-slate-400 max-w-[260px]">{d.status_note}</td>
            <td>{d.status === "pending_verification" && <button className="text-xs text-amber-400" disabled={recheck.isPending} onClick={() => recheck.mutate(d.id)} data-testid={`deposit-recheck-${d.id}`}>Re-check</button>}</td></tr>)}</tbody></table></div> : <Empty title="No deposits yet" />}
        {hist.data && <Pager page={page} size={10} total={hist.data.total} onPage={setPage} />}
      </Glass>
    </div>
  );
}

function Withdraw() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const info = useQuery({ queryKey: ["wd-info"], queryFn: () => get("/withdrawals/info") });
  const [page, setPage] = useState(1);
  const hist = useQuery({ queryKey: ["withdrawals", page], queryFn: () => get("/withdrawals", { page, size: 10 }) });
  const [f, setF] = useState({ amount: "", destination_type: "usdt_trc20", destination: "", totp_code: "" });
  const [key, setKey] = useState(newKey);
  const [err, setErr] = useState(null);
  const refresh = () => ["withdrawals", "wd-info", "dashboard", "wallet"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const mut = useMutation({ mutationFn: () => api.post("/withdrawals", { ...f, amount: Number(f.amount), idem_key: key, totp_code: f.totp_code || null }),
    onSuccess: () => { toast.success("Withdrawal request submitted"); setKey(newKey()); setF({ ...f, amount: "" }); setErr(null); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const cancel = useMutation({ mutationFn: (id) => api.post(`/withdrawals/${id}/cancel`), onSuccess: () => { toast.success("Request cancelled; balance released"); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  if (info.isLoading) return <Loader />;
  const i = info.data;
  const amt = Math.round(Number(f.amount || 0) * 100);
  const fee = Math.floor((amt * Math.round(i.config.fee_percent * 100)) / 10000) + Math.round(i.config.fee_flat * 100);
  return (
    <div data-testid="withdraw-page">
      <PageHeader title="Withdraw USDT" subtitle="Withdraw from your USDT balance. Payouts are verified on the blockchain before completion. Plan coins and plan earnings cannot be withdrawn." />
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
        <Glass className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Available USDT balance" value={coins(i.verified?.available)} testid="wd-available" />
            <Stat label="Reserved for open requests" value={coins(i.verified?.reserved)} tone="violet" testid="wd-reserved" />
          </div>
          {!i.enabled && <ErrorBox error="Withdrawals are currently disabled by the administrator." />}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Amount (USDT)" hint={`Min ${i.config.min} · Max ${i.config.max}`}><Input className="inp font-num" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="wd-amount-input" /></Field>
            <Field label="Network"><select className="w-full bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-sm h-10" value={f.destination_type} onChange={(e) => setF({ ...f, destination_type: e.target.value })} data-testid="wd-method-select">
              <option value="usdt_trc20">USDT TRC20</option><option value="usdt_bep20">USDT BEP20</option></select></Field>
          </div>
          <Field label="Destination address" hint={{ usdt_trc20: "T… address (34 chars)", usdt_bep20: "0x… address (42 chars)" }[f.destination_type]}><Input className="inp font-num" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} data-testid="wd-destination-input" /></Field>
          {user.totp_enabled && <Field label="2FA code"><Input className="inp font-num" value={f.totp_code} onChange={(e) => setF({ ...f, totp_code: e.target.value })} data-testid="wd-totp-input" /></Field>}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3 text-sm grid grid-cols-3 gap-2" data-testid="wd-fee-preview">
            <div><p className="text-xs text-slate-500">Amount</p><p className="font-num">{coins(amt)}</p></div><div><p className="text-xs text-slate-500">Fee ({i.config.fee_percent}%{i.config.fee_flat ? ` + ${i.config.fee_flat}` : ""})</p><p className="font-num text-red-300">{coins(fee)}</p></div>
            <div><p className="text-xs text-slate-500">Net amount</p><p className="font-num text-emerald-300" data-testid="wd-net">{coins(Math.max(amt - fee, 0))}</p></div>
          </div>
          <ErrorBox error={err} />
          <Confirm testid="wd-confirm" title="Submit withdrawal request?" description={`${coins(amt)} USDT will be reserved from your USDT balance until the request is completed, rejected or cancelled. Double-check the address and network — crypto transfers cannot be reversed.`}
            onConfirm={() => mut.mutate()} trigger={<button className="btn-gold w-full" disabled={mut.isPending || !amt || !f.destination || !i.enabled} data-testid="wd-submit-btn">Submit request</button>} />
        </Glass>
        <div className="space-y-4"><TelegramButton testid="withdraw-telegram-btn" />
          <Glass className="text-sm text-slate-400 space-y-2"><p className="text-white font-semibold">How requests are protected</p><p>Only one open request is allowed at a time. The requested amount is reserved immediately, so two requests can never spend the same balance.</p><p>Every administrator action is recorded in the audit log.</p></Glass></div>
      </div>
      <Glass className="mt-6" data-testid="wd-history">
        <h3 className="font-semibold text-white mb-3">Withdrawal requests</h3>
        {hist.data?.items.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Amount</th><th>Fee</th><th>Net</th><th>Destination</th><th>Status</th><th>Note</th><th /></tr></thead>
          <tbody>{hist.data.items.map((w) => <tr key={w.id}><td className="whitespace-nowrap">{fdate(w.created_at)}</td><td className="font-num">{coins(w.amount)}</td><td className="font-num">{coins(w.fee)}</td><td className="font-num">{coins(w.net_amount)}</td>
            <td className="font-num text-xs break-all max-w-[160px]">{w.destination}</td><td><StatusBadge status={w.status} testid={`wd-status-${w.id}`} /></td><td className="text-xs text-slate-400">{w.status_note}</td>
            <td>{["submitted", "under_review"].includes(w.status) && <button className="text-xs text-red-300" onClick={() => cancel.mutate(w.id)} data-testid={`wd-cancel-${w.id}`}>Cancel</button>}</td></tr>)}</tbody></table></div> : <Empty title="No withdrawal requests" />}
        {hist.data && <Pager page={page} size={10} total={hist.data.total} onPage={setPage} />}
      </Glass>
    </div>
  );
}

const PAGES = { wallet: Wallet, deposit: Deposit, withdraw: Withdraw };
export default function Finance({ page }) {
  const P = PAGES[page];
  return <P />;
}
