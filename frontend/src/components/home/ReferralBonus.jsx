import { Link } from "react-router-dom";
import { UserPlus, PlayCircle, GraduationCap, ArrowRight, Coins } from "lucide-react";
import { Glass } from "@/components/common";
import { Reveal, SectionHead } from "@/components/home/Sections";

const CARDS = [
  ["friend_signup", UserPlus, "Invite a friend", "A friend joins Finzo.cc with your referral link."],
  ["friend_webinar", PlayCircle, "Friend completes the webinar", "Your friend finishes the welcome webinar."],
  ["own_webinar", GraduationCap, "Finish your own webinar", "Complete the welcome webinar after joining."],
];

export function ReferralBonus({ amounts, symbol = "FZC" }) {
  if (!amounts) return null;
  return (
    <section id="referral-bonus" className="max-w-7xl mx-auto px-4 sm:px-6 py-20" data-testid="referral-bonus-section">
      <SectionHead eyebrow="Referral bonus" title="Invite friends. Earn Finzo Coins." text="Every reward is a fixed number of coins for an action, so you know exactly what you get." />
      <div className="grid md:grid-cols-3 gap-5">
        {CARDS.map(([k, Icon, t, d], i) => (
          <Reveal key={k} delay={i * 0.08}>
            <Glass className="h-full relative overflow-hidden group hover:border-amber-500/50 transition-colors" data-testid={`referral-card-${k}`}>
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl group-hover:bg-amber-500/20 transition-colors" />
              <Icon className="w-8 h-8 text-amber-400 mb-4" />
              <p className="font-num text-4xl text-white" data-testid={`referral-amount-${k}`}>+{amounts[k] ?? 0} <span className="text-base text-amber-300">{symbol}</span></p>
              <p className="text-white font-semibold mt-3">{t}</p>
              <p className="text-sm text-slate-400 mt-1">{d}</p>
            </Glass>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.25} className="mt-8 flex flex-wrap items-center gap-4">
        <Link to="/register" className="btn-gold" data-testid="referral-cta-btn"><Coins className="w-4 h-4" />Get my referral link<ArrowRight className="w-4 h-4" /></Link>
      </Reveal>
    </section>
  );
}
