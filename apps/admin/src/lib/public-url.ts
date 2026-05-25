"use client";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "wain.publicAppUrl";

/**
 * The URL that QR codes should encode. We need an address phones on the local
 * network (or the internet) can reach — `localhost` doesn't work on a phone.
 *
 * Resolution order:
 *   1. localStorage override (user-set in admin)
 *   2. current admin origin, with the admin port (:3001) swapped for the web app port (:3000)
 *   3. http://localhost:3000 (won't actually work on a phone)
 */
export function getDefaultPublicUrl(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  const origin = window.location.origin;
  // Replace admin port (3001) with web port (3000). Works whether origin is
  // http://localhost:3001, http://192.168.x.y:3001, or https://admin.example.com.
  if (origin.includes(":3001")) return origin.replace(":3001", ":3000");
  // No port in origin (e.g. behind a proxy). Try a sibling subdomain swap.
  return origin.replace(/\/\/admin\./, "//");
}

export function isLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
}

export function usePublicAppUrl() {
  const [url, setUrlState] = useState<string>("");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setUrlState(stored && stored.trim().length > 0 ? stored : getDefaultPublicUrl());
  }, []);

  const setUrl = useCallback((next: string) => {
    const cleaned = next.trim().replace(/\/+$/, "");
    if (cleaned) window.localStorage.setItem(STORAGE_KEY, cleaned);
    else window.localStorage.removeItem(STORAGE_KEY);
    setUrlState(cleaned || getDefaultPublicUrl());
  }, []);

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUrlState(getDefaultPublicUrl());
  }, []);

  return { url, setUrl, reset, isLocalhost: isLocalhost(url) };
}
