"use client";

interface Props {
  /** Normalized screen coords (-1..1) of the destination as projected by the camera. */
  destScreen: { x: number; y: number; inView: boolean } | null;
  /** Optional distance in floor units to show next to the arrow. */
  distance?: number | null;
}

/**
 * When the destination is off-screen during navigation, render a clamped
 * arrow on the nearest viewport edge pointing toward it.
 */
export default function OffscreenDestinationArrow({ destScreen, distance }: Props) {
  if (!destScreen || destScreen.inView) return null;

  // Convert (-1..1) into percent positions, clamped just inside the viewport.
  const margin = 12; // px from edge
  const xPct = ((destScreen.x + 1) / 2) * 100;
  const yPct = ((-destScreen.y + 1) / 2) * 100; // invert Y (screen Y goes down)

  const clampedX = Math.max(8, Math.min(92, xPct));
  const clampedY = Math.max(20, Math.min(80, yPct));

  // angle in degrees from screen center to the destination
  const cx = 50, cy = 50;
  const angle = Math.atan2(yPct - cy, xPct - cx) * (180 / Math.PI);

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        left: `${clampedX}%`,
        top: `${clampedY}%`,
        transform: `translate(-50%, -50%)`,
      }}
    >
      <div className="bg-red-500 text-white rounded-full px-3 py-2 shadow-lg flex items-center gap-2 border-2 border-white">
        <span
          className="text-lg leading-none"
          style={{ display: "inline-block", transform: `rotate(${angle + 90}deg)` }}
        >
          ▲
        </span>
        {distance != null && (
          <span className="text-xs font-bold whitespace-nowrap">{Math.round(distance)}m</span>
        )}
      </div>
    </div>
  );
}
