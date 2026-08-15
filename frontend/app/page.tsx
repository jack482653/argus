"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listEvents } from "@/apis/events";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventSummary } from "@/types/responses/events";

export default function DashboardHomePage() {
  const auth = useRequireAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    listEvents().then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status !== "authenticated") {
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl">Argus Dashboard</h1>
        <span className="text-sm text-muted-foreground">{auth.user.email}</span>
      </div>
      <ul className="mt-6 flex flex-col gap-2">
        {events === null && <li>Loading…</li>}
        {events?.length === 0 && <li>No events yet.</li>}
        {events?.map((event) => (
          <li key={event.event_slug}>
            <Link
              href={`/events?slug=${encodeURIComponent(event.event_slug)}`}
              className="text-primary underline underline-offset-4"
            >
              {event.event_name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
