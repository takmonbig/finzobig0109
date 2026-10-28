import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSite, Loader } from "@/components/common";
import { Hero, Benefits, HowItWorks, Trading } from "@/components/home/Sections";
import { PlansSection, TeamDiagram, RewardsSection, FAQ } from "@/components/home/Interactive";
import { TeamBonus } from "@/components/home/TeamBonus";
import { TeamMembers, CoinRateSection } from "@/components/home/TeamRate";

export default function Home() {
  const { data: site, isLoading } = useSite();
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api.get("/public/plans").then((r) => r.data) });
  const rewards = useQuery({ queryKey: ["public-rewards"], queryFn: () => api.get("/public/rewards").then((r) => r.data) });
  const ranks = useQuery({ queryKey: ["public-ranks"], queryFn: () => api.get("/public/ranks").then((r) => r.data) });
  if (isLoading) return <Loader />;
  const c = site?.content || {};
  return (
    <div data-testid="home-page">
      <Hero c={c.hero} />
      <Benefits items={c.benefits} />
      <PlansSection plans={plans.data || []} />
      <HowItWorks steps={c.how_it_works} />
      <Trading items={c.trading} risks={c.risk_points} />
      <CoinRateSection rate={c.coin_rate} coin={site?.settings?.coin} />
      <TeamDiagram ranks={ranks.data?.ranks || []} />
      <TeamBonus ranks={ranks.data?.ranks || []} commission={ranks.data?.commission_bp || {}} />
      <RewardsSection rewards={rewards.data || []} />
      <TeamMembers members={c.team_members} />
      <FAQ items={c.faqs} />
    </div>
  );
}
