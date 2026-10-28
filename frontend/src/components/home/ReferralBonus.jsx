import { Link } from "react-router-dom";
import { ArrowRight, Coins } from "lucide-react";
import { Reveal, SectionHead } from "@/components/home/Sections";
import { ReferPoster } from "@/components/ReferPlan";

export function ReferralBonus({ amounts, symbol = "FZC" }) {
  if (!amounts) return null;
  return (
    <section id="referral-bonus" className="max-w-5xl mx-auto px-4 sm:px-6 py-20" data-testid="referral-bonus-section">
      <SectionHead eyebrow="Referral bonus" title="Invite friends. Earn Finzo Coins at 3 levels." text="Every reward is a fixed number of coins for an action, so you know exactly what you get." />
      <Reveal><ReferPoster amounts={amounts} symbol={symbol} showCta={false} /></Reveal>
      <Reveal delay={0.2} className="mt-8 flex flex-wrap items-center gap-4">
        <Link to="/register" className="btn-gold" data-testid="referral-cta-btn"><Coins className="w-4 h-4" />Get my referral link<ArrowRight className="w-4 h-4" /></Link>
      </Reveal>
    </section>
  );
}
