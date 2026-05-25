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
          className="fixed top-3 right-3 z-50 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          Log out
        </button>
      )}
      {children}
    </>
  );
}
