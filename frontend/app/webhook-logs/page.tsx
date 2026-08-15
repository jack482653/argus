"use client";

import { useEffect, useState, useTransition } from "react";
import {
  clearWebhookLogs,
  deleteWebhookLog,
  listWebhookLogs,
} from "@/apis/webhook-logs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { WebhookLogsPage } from "@/types/responses/webhook-logs";

const PAGE_SIZE = 50;

export default function WebhookLogsPage() {
  const auth = useRequireAuth();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WebhookLogsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    return (
      <p className="p-6 text-destructive">Failed to load: {auth.message}</p>
    );
  }
  if (auth.status !== "authenticated") {
    return null;
  }

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
    <main className="mx-auto max-w-4xl p-8">
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
      {page && (
        <>
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium">Channel</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {page.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <Badge className="rounded bg-chart-3/15 px-2 py-0.5 font-mono text-xs text-chart-3">
                        {item.method}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {item.channel ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {item.created_at}
                    </td>
                    <td className="px-4 py-2.5 text-right">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of{" "}
              {page.total}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
