"use client";

interface Props {
  /** Raw map bearing in radians (clockwise from floor-plan up). */
  azimuth: number;
  /** Degrees from the floor plan's "up" to true north (clockwise). */
  northOffset?: number;
}

export default function Compass({ azimuth, northOffset = 0 }: Props) {
  const bearingDeg = (azimuth * 180) / Math.PI;
  // Needle points at true north on screen: northOffset clockwise from map-north,
  // and map-north sits at -bearing on screen.
  const needleDeg = northOffset - bearingDeg;

  return (
    <div
      className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center relative"
      aria-label="Compass — true north"
      title="True north"
    >
      <div
        className="absolute inset-0 flex items-start justify-center pt-1"
        style={{ transform: `rotate(${needleDeg}deg)`, transition: "transform 120ms linear" }}
      >
        <div className="flex flex-col items-center">
          <span className="text-red-500 font-bold text-[10px] leading-none">N</span>
          <span className="block w-px h-3 bg-red-400" />
        </div>
      </div>
      <span className="text-[10px] font-semibold text-slate-400">·</span>
    </div>
  );
}
