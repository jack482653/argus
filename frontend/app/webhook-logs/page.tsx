"use client";

import { useEffect, useState, useTransition } from "react";
import {
  clearWebhookLogs,
  deleteWebhookLog,
  listWebhookLogs,
} from "@/apis/webhook-logs";
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
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl">Webhook Logs</h1>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={isPending}
          className="text-sm text-destructive underline"
        >
          Clear all
        </button>
      </div>
      {error && <p className="mt-4 text-destructive">{error}</p>}
      {page === null && !error && <p className="mt-4">Loading…</p>}
      {page && (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th>Method</th>
                <th>Channel</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.method}</td>
                  <td>{item.channel ?? "—"}</td>
                  <td>{item.created_at}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="text-destructive underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of{" "}
              {page.total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
