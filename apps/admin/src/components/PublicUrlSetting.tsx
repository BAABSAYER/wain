"use client";
import { useState } from "react";
import { usePublicAppUrl } from "@/lib/public-url";

export default function PublicUrlSetting({ compact = false }: { compact?: boolean }) {
  const { url, setUrl, reset, isLocalhost } = usePublicAppUrl();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  const startEdit = () => { setDraft(url); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = () => { setUrl(draft); setEditing(false); };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">QR URL:</span>
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className="font-mono bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 text-xs outline-none w-72"
            />
            <button onClick={save} className="text-blue-600 hover:text-blue-800 font-medium">Save</button>
            <button onClick={cancel} className="text-slate-400 hover:text-slate-700">Cancel</button>
          </>
        ) : (
          <>
            <span className={`font-mono ${isLocalhost ? "text-amber-700" : "text-slate-700"}`}>{url}</span>
            <button onClick={startEdit} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Public app URL</span>
            {isLocalhost && (
              <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                phones can't reach localhost
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            URL that gets encoded in QR codes. Use your machine's LAN IP (e.g. <code className="bg-slate-100 px-1 rounded">http://192.168.1.5:3000</code>) or a real domain so phones can open it.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              placeholder="http://192.168.1.5:3000"
              className="font-mono flex-1 bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-sm outline-none"
            />
            <button onClick={save} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-semibold">Save</button>
            <button onClick={cancel} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
          </>
        ) : (
          <>
            <code className={`flex-1 font-mono px-3 py-1.5 rounded text-sm truncate ${isLocalhost ? "bg-amber-50 text-amber-900 border border-amber-200" : "bg-slate-50 text-slate-800 border border-slate-200"}`}>
              {url || "—"}
            </code>
            <button onClick={startEdit} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-sm font-medium">Edit</button>
            <button onClick={reset} className="px-3 py-1.5 text-slate-400 hover:text-slate-700 text-sm" title="Reset to detected URL">Reset</button>
          </>
        )}
      </div>
    </div>
  );
}
