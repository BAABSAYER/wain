"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthed, logout } from "@/lib/auth";

/**
 * Client guard: redirects to /login when there's no admin token. Wraps the whole
 * admin app. The /login route renders without the guard.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/login")) { setOk(true); return; }
    if (!isAuthed()) { router.replace("/login"); return; }
    setOk(true);
  }, [pathname, router]);

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <>
      {!pathname.startsWith("/login") && (
        <button
          onClick={logout}
          title="Log out"
          aria-label="Log out"
          // Bottom-left corner so it never fights with toolbar Save buttons or
          // other top-right controls. Icon-only by default, label appears on
          // hover, low contrast so it doesn't pull attention from the work area.
          className="group fixed bottom-3 left-3 z-40 flex items-center gap-1.5 px-2 py-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg text-xs text-slate-500 hover:text-slate-900 hover:bg-white shadow-sm"
        >
          <span>⎋</span>
          <span className="hidden group-hover:inline">Log out</span>
        </button>
      )}
      {children}
    </>
  );
}
