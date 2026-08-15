"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { deleteEvent, listEvents, triggerReport } from "@/apis/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventSummary } from "@/types/responses/events";

function formatStartDate(startAt: string | null): string | null {
  if (!startAt) return null;
  // Stored as a UTC ISO string with no offset (see SPEC.md); append "Z" so
  // Date parses it as UTC rather than the browser's local time zone.
  return new Date(`${startAt}Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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
      <p className="p-8 text-base text-destructive">
        Failed to load: {auth.message}
      </p>
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
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {auth.user.email}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTriggerReport}
          disabled={isPending}
        >
          <RefreshCw className="size-3.5" />
          Run report now
        </Button>
      </div>
      {error && <p className="mt-4 text-base text-destructive">{error}</p>}
      <div className="mt-8 flex flex-col gap-3">
        {events === null && !error && (
          <p className="text-base text-muted-foreground">Loading…</p>
        )}
        {events?.length === 0 && (
          <p className="text-base text-muted-foreground">No events yet.</p>
        )}
        {events?.map((event) => {
          const startLabel = formatStartDate(event.start_at);
          return (
            <div
              key={event.event_slug}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <Link
                href={`/events?slug=${encodeURIComponent(event.event_slug)}`}
                className="min-w-0 flex-1"
              >
                <div className="text-base font-medium">{event.event_name}</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  {event.channel && (
                    <Badge className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs text-primary">
                      {event.channel}
                    </Badge>
                  )}
                  {event.capacity !== null && (
                    <span>Capacity {event.capacity}</span>
                  )}
                  {startLabel && (
                    <>
                      <span className="text-border">·</span>
                      <span>Starts {startLabel}</span>
                    </>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    handleDelete(event.event_slug, event.event_name)
                  }
                  disabled={isPending}
                >
                  Delete
                </Button>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
