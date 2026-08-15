"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deleteEvent, listEvents, triggerReport } from "@/apis/events";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventSummary } from "@/types/responses/events";

export default function DashboardHomePage() {
  const auth = useRequireAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    listEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load events",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status === "loading") {
    return null;
  }
  if (auth.status === "error") {
    return (
      <p className="p-6 text-destructive">Failed to load: {auth.message}</p>
    );
  }
  if (auth.status !== "authenticated") {
    return null;
  }

  const handleTriggerReport = () => {
    startTransition(async () => {
      await triggerReport();
    });
  };

  const handleDelete = (slug: string, name: string) => {
    if (
      !window.confirm(
        `Delete event "${name}"?\n\nThis will permanently remove the event and all of its tickets.\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteEvent(slug);
      await listEvents()
        .then(setEvents)
        .catch((err: unknown) => {
          setError(
            err instanceof Error ? err.message : "Failed to load events",
          );
        });
    });
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl">Argus Dashboard</h1>
        <span className="text-sm text-muted-foreground">{auth.user.email}</span>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleTriggerReport}
          disabled={isPending}
          className="text-sm text-primary underline underline-offset-4"
        >
          Run report now
        </button>
      </div>
      {error && <p className="mt-4 text-destructive">{error}</p>}
      <ul className="mt-6 flex flex-col gap-2">
        {events === null && !error && <li>Loading…</li>}
        {events?.length === 0 && <li>No events yet.</li>}
        {events?.map((event) => (
          <li
            key={event.event_slug}
            className="flex items-center justify-between gap-4"
          >
            <Link
              href={`/events?slug=${encodeURIComponent(event.event_slug)}`}
              className="text-primary underline underline-offset-4"
            >
              {event.event_name}
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(event.event_slug, event.event_name)}
              disabled={isPending}
              className="text-sm text-destructive underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
