"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/apis/auth";
import type { CurrentUser } from "@/types/responses/auth";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export function useRequireAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        if (user) {
          setState({ status: "authenticated", user });
        } else {
          setState({ status: "unauthenticated" });
          window.location.href = "/dashboard/login";
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
