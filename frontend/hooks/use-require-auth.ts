"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/apis/auth";
import type { CurrentUser } from "@/types/responses/auth";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unauthenticated" };

export function useRequireAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((user) => {
      if (cancelled) return;
      if (user) {
        setState({ status: "authenticated", user });
      } else {
        setState({ status: "unauthenticated" });
        window.location.href = "/dashboard/login";
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
