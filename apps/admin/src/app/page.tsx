import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8 bg-slate-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">وين — Wain</h1>
        <p className="text-slate-500 text-lg">Indoor Navigation Admin Portal</p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/buildings"
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium shadow-sm transition-colors"
        >
          Manage Buildings
        </Link>
      </div>
    </main>
  );
}
