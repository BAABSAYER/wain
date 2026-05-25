"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", nameAr: "", slug: "", address: "" });

  useEffect(() => {
    api.getBuildings().then(setBuildings).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = await api.createBuilding(form);
    setBuildings((prev) => [...prev, b]);
    setShowForm(false);
    setForm({ name: "", nameAr: "", slug: "", address: "" });
  };

  return (
    <main className="max-w-4xl mx-auto p-8 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buildings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your indoor spaces</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm"
        >
          + New Building
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-6 mb-6 flex flex-col gap-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Create Building</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Name (EN)</span>
              <input required className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-2 text-sm text-slate-900 outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Name (AR)</span>
              <input dir="rtl" required className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-2 text-sm text-slate-900 outline-none" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Slug (URL-safe)</span>
              <input required className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-2 text-sm text-slate-900 outline-none font-mono" placeholder="e.g. riyadh-mall" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-medium">Address</span>
              <input className="bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-2 text-sm text-slate-900 outline-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm">Create</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-slate-400 text-center py-16">Loading…</div>
      ) : buildings.length === 0 ? (
        <div className="text-slate-400 text-center py-16">No buildings yet. Create your first one.</div>
      ) : (
        <div className="grid gap-3">
          {buildings.map((b) => (
            <Link
              key={b.id}
              href={`/buildings/${b.id}`}
              className="bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl p-5 flex items-center justify-between transition-colors shadow-sm"
            >
              <div>
                <div className="font-semibold text-slate-900">{b.name}</div>
                <div className="text-slate-500 text-sm" dir="rtl">{b.nameAr}</div>
                <div className="text-slate-400 text-xs mt-1">{b.floors?.length ?? 0} floor(s) — /{b.slug}</div>
              </div>
              <span className="text-slate-400 text-xl">›</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
