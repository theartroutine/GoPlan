"use client";

import type { ReactNode } from "react";

import { OverviewBudgetCard } from "@/features/trips/presentation/overview-budget-card";
import { OverviewDatesCard } from "@/features/trips/presentation/overview-dates-card";
import { OverviewDescriptionCard } from "@/features/trips/presentation/overview-description-card";
import { OverviewMembersCard } from "@/features/trips/presentation/overview-members-card";
import { getTodayDateOnly } from "@/features/trips/domain/trip-countdown";
import { useTripContext } from "@/features/trips/presentation/trip-context";
import { useInView } from "@/shared/hooks/use-in-view";

type CardWrapperProps = {
  index: number;
  className?: string;
  children: ReactNode;
};

function StaggerCard({ index, className, children }: CardWrapperProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: "-10% 0px",
    once: true,
  });
  return (
    <div
      ref={ref}
      data-in-view={inView}
      style={{ transitionDelay: `${index * 80}ms` }}
      className={[
        "rounded-xl border border-border/60 bg-card p-4 shadow-xs transition-all duration-300 sm:p-5",
        "opacity-0 translate-y-3 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "data-[in-view=true]:opacity-100 data-[in-view=true]:translate-y-0",
        "motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-border motion-reduce:hover:translate-y-0",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function OverviewTab() {
  const { tripId, data } = useTripContext();
  if (!data) return null;

  const { trip, members } = data;
  const today = getTodayDateOnly();
  const cards: { key: string; node: ReactNode; span?: boolean }[] = [];

  cards.push({
    key: "dates",
    node: (
      <OverviewDatesCard
        start={trip.start_date}
        end={trip.end_date}
        status={trip.status}
        today={today}
      />
    ),
  });

  cards.push({
    key: "members",
    node: <OverviewMembersCard tripId={tripId} members={members} />,
  });

  if (trip.budget_estimate) {
    cards.push({
      key: "budget",
      node: (
        <OverviewBudgetCard
          budgetEstimate={trip.budget_estimate}
          currencyCode={trip.currency_code}
          memberCount={members.length}
        />
      ),
    });
  }

  if (trip.description && trip.description.trim()) {
    cards.push({
      key: "description",
      node: <OverviewDescriptionCard description={trip.description} />,
      span: true,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {cards.map((c, i) => (
        <StaggerCard key={c.key} index={i} className={c.span ? "sm:col-span-2" : ""}>
          {c.node}
        </StaggerCard>
      ))}
    </div>
  );
}
