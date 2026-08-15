"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getEventTimeseries } from "@/apis/events";
import { EventChart } from "@/components/event-chart";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventTimeseries } from "@/types/responses/events";

function EventDetailContent() {
  const auth = useRequireAuth();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const [timeseries, setTimeseries] = useState<EventTimeseries | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated" || !slug) return;
    let cancelled = false;
    getEventTimeseries(slug).then((result) => {
      if (!cancelled) setTimeseries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status, slug]);

  if (auth.status !== "authenticated") {
    return null;
  }

  if (!slug) {
    return <p className="p-6">No event selected.</p>;
  }

  if (!timeseries) {
    return <p className="p-6">Loading…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-heading text-2xl">{timeseries.event.event_name}</h1>
      <EventChart timeseries={timeseries} />
    </main>
  );
}

export default function EventDetailPage() {
  // useSearchParams() opts the page out of static prerendering unless it's
  // wrapped in Suspense — required even for a fully client-rendered,
  // statically-exported route like this one (see next.config.ts's
  // `output: "export"`).
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <EventDetailContent />
    </Suspense>
  );
}
