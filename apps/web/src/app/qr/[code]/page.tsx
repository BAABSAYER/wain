import { redirect } from "next/navigation";

// QR codes embed a stable `/qr/<code>` URL that resolves to the currently
// assigned nav node at scan time — so a printed sticker keeps working even
// after the underlying map is redrawn or a node is deleted.

// SSR call goes container-to-container on the docker net. Override in dev
// (when running `next dev` on the host) by setting
// WAIN_API_INTERNAL_URL=http://localhost:4000/api in apps/web/.env.
const API_INTERNAL = process.env.WAIN_API_INTERNAL_URL || "http://api:4000/api";

// Force dynamic rendering — never want a cached redirect target.
export const dynamic = "force-dynamic";

interface QrRecord {
  id: string;
  buildingId: string;
  floorId: string;
  nodeId: string | null;
  code: string;
  label: string;
  node?: { floorId: string } | null;
}

async function resolveQr(code: string): Promise<QrRecord | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/qr/resolve/${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as QrRecord;
  } catch {
    return null;
  }
}

export default async function QrCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const qr = await resolveQr(code);

  // QR doesn't exist in the system.
  if (!qr) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          <div className="text-5xl mb-2">⚠</div>
          <h1 className="text-xl font-bold text-slate-900">QR code not recognized</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            This QR isn&apos;t in our system. Please ask staff for assistance.
          </p>
          <p className="text-xs text-slate-400 mt-3" dir="rtl">
            رمز الاستجابة السريعة غير معروف. يُرجى الاستعانة بأحد الموظفين.
          </p>
          <p className="text-[10px] text-slate-300 mt-4 font-mono">{code}</p>
        </div>
      </main>
    );
  }

  // Registered but not yet linked to a node — happens after a node delete
  // before the admin reassigns the QR.
  if (!qr.nodeId) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          <div className="text-5xl mb-2">📍</div>
          <h1 className="text-xl font-bold text-slate-900">
            {qr.label || qr.code}
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            This QR is registered but hasn&apos;t been linked to a location yet.
            Please ask staff to assign it.
          </p>
          <p className="text-xs text-slate-400 mt-3" dir="rtl">
            هذا الرمز مُسجَّل ولكن لم يُربط بعد بأي موقع.
          </p>
          <p className="text-[10px] text-slate-300 mt-4 font-mono">{qr.code}</p>
        </div>
      </main>
    );
  }

  // Happy path: hand off to the visitor nav page.
  const nodeFloorId = qr.node?.floorId ?? qr.floorId;
  redirect(`/nav/${qr.buildingId}/${nodeFloorId}/${qr.nodeId}`);
}
