"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import {
  clearWebhookLogs,
  deleteWebhookLog,
  listWebhookLogs,
} from "@/apis/webhook-logs";
import { EmptyState } from "@/components/empty-state";
import { JsonViewer } from "@/components/json-viewer";
import { PaginationFooter } from "@/components/pagination-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { formatTaipeiDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type {
  WebhookLogEntry,
  WebhookLogsPage,
} from "@/types/responses/webhook-logs";

const PAGE_SIZE = 50;

function summarizeBody(body: string | null): string {
  if (!body) return "—";
  try {
    const parsed = JSON.parse(body) as {
      notifications?: Array<{ type?: string; event?: { slug?: string } }>;
    };
    const notification = parsed.notifications?.[0];
    if (notification?.type && notification.event?.slug) {
      return `${notification.type} · ${notification.event.slug}`;
    }
  } catch {
    // Not JSON, or not the shape we expect — show the placeholder below.
  }
  return "—";
}

export default function WebhookLogsPage() {
  const auth = useRequireAuth();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WebhookLogsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  const reload = () => {
    return listWebhookLogs(PAGE_SIZE, offset)
      .then(setPage)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load logs");
      });
  };

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, offset]);

  if (auth.status === "loading") {
    return null;
  }
  if (auth.status === "error") {
    return <p className="text-destructive">Failed to load: {auth.message}</p>;
  }
  if (auth.status !== "authenticated") {
    return null;
  }

  const toggleOpen = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      await deleteWebhookLog(id);
      await reload();
    });
  };

  const handleClearAll = () => {
    if (
      !window.confirm(
        `Clear ALL ${page?.total ?? 0} webhook logs? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await clearWebhookLogs();
      setOffset(0);
      // Fetch page 0 directly rather than calling reload() here — reload()'s
      // closure was created with the OLD offset value at render time, and
      // setOffset(0) above doesn't take effect until the next render, so
      // calling reload() synchronously in this same handler would still
      // request the stale offset.
      await listWebhookLogs(PAGE_SIZE, 0)
        .then(setPage)
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to load logs");
        });
    });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-semibold">Webhook Logs</h1>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={handleClearAll}
          disabled={isPending}
        >
          Clear all
        </Button>
      </div>
      {error && <p className="mt-4 text-base text-destructive">{error}</p>}
      {page === null && !error && (
        <p className="mt-4 text-base text-muted-foreground">Loading…</p>
      )}
      {page && page.total === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Inbox}
            title="No webhook events yet"
            description="Registration and cancellation webhooks from KKTIX will show up here."
          />
        </div>
      )}
      {page && page.total > 0 && (
        <>
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-[2rem_4rem_9rem_5rem_6rem_1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span />
              <span>ID</span>
              <span>Created</span>
              <span>Method</span>
              <span>Channel</span>
              <span>Body</span>
              <span />
            </div>
            {page.items.map((item: WebhookLogEntry) => {
              const isOpen = openIds.has(item.id);
              return (
                <Collapsible
                  key={item.id}
                  open={isOpen}
                  onOpenChange={() => toggleOpen(item.id)}
                  className="border-b border-border last:border-b-0"
                >
                  <div className="grid grid-cols-[2rem_4rem_9rem_5rem_6rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm">
                    <CollapsibleTrigger
                      aria-label={
                        isOpen ? "Collapse details" : "Expand details"
                      }
                      className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                    </CollapsibleTrigger>
                    <span className="text-muted-foreground">{item.id}</span>
                    <span className="text-muted-foreground">
                      {formatTaipeiDateTime(item.created_at)}
                    </span>
                    <Badge className="w-fit rounded bg-chart-3/15 px-2 py-0.5 font-mono text-xs text-chart-3">
                      {item.method}
                    </Badge>
                    <span className="text-foreground">
                      {item.channel ?? "—"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {summarizeBody(item.body)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                    >
                      Delete
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-4 border-t border-border p-4">
                      <div>
                        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Headers
                        </p>
                        <JsonViewer value={item.headers} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Body
                        </p>
                        {item.body ? (
                          <JsonViewer value={item.body} />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No body.
                          </p>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
          <div className="mt-4">
            <PaginationFooter
              offset={offset}
              limit={PAGE_SIZE}
              total={page.total}
              onOffsetChange={setOffset}
            />
          </div>
        </>
      )}
    </>
  );
}
