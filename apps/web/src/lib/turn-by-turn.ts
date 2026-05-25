/** Convert a polyline of waypoints into human-readable turn instructions. */

export interface Waypoint { x: number; y: number; floorId: string; nodeId?: string; }

export type TurnDir = "straight" | "left" | "right" | "sharp-left" | "sharp-right" | "u-turn" | "arrive";

export interface TurnStep {
  /** Index of the waypoint where this turn happens (the *vertex* the user is approaching). */
  atIndex: number;
  /** Distance in floor units from previous turn (or start) to this one. */
  distance: number;
  /** Direction to turn at this waypoint. */
  dir: TurnDir;
  /** Bearing change in radians (signed). */
  deltaBearing: number;
}

const STRAIGHT_RAD = Math.PI / 8;       // ±22.5°
const SLIGHT_RAD = (3 * Math.PI) / 8;   // ±67.5°
const SHARP_RAD = (7 * Math.PI) / 8;    // ±157.5°

function bearing(a: Waypoint, b: Waypoint): number {
  return Math.atan2(b.x - a.x, -(b.y - a.y)); // page coords → world bearing
}

function normalize(delta: number): number {
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

function classify(deltaBearing: number): TurnDir {
  const abs = Math.abs(deltaBearing);
  if (abs <= STRAIGHT_RAD) return "straight";
  if (abs >= SHARP_RAD) return "u-turn";
  if (abs <= SLIGHT_RAD) return deltaBearing > 0 ? "right" : "left";
  return deltaBearing > 0 ? "sharp-right" : "sharp-left";
}

function dist(a: Waypoint, b: Waypoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Walk through the waypoints and emit one TurnStep per *real* turn (skipping
 * straight-throughs). The final step is always "arrive".
 */
export function deriveTurns(steps: Waypoint[]): TurnStep[] {
  if (steps.length < 2) return [];
  const out: TurnStep[] = [];

  let lastTurnIdx = 0;
  let cumulative = 0;

  for (let i = 1; i < steps.length - 1; i++) {
    const prev = steps[i - 1];
    const here = steps[i];
    const next = steps[i + 1];
    cumulative += dist(prev, here);
    const b1 = bearing(prev, here);
    const b2 = bearing(here, next);
    const delta = normalize(b2 - b1);
    const dir = classify(delta);
    if (dir !== "straight") {
      out.push({ atIndex: i, distance: cumulative, dir, deltaBearing: delta });
      cumulative = 0;
      lastTurnIdx = i;
    }
  }

  // Final arrival segment
  const tailDist = (() => {
    let d = cumulative;
    for (let i = Math.max(lastTurnIdx, 0); i < steps.length - 1; i++) {
      if (i === lastTurnIdx) continue;
      d += dist(steps[i], steps[i + 1]);
    }
    // Simpler: distance from last turn to end
    let total = 0;
    for (let i = lastTurnIdx; i < steps.length - 1; i++) {
      total += dist(steps[i], steps[i + 1]);
    }
    return total;
  })();

  out.push({
    atIndex: steps.length - 1,
    distance: tailDist,
    dir: "arrive",
    deltaBearing: 0,
  });
  return out;
}

/** Returns the active turn for the user's current step index. */
export function activeTurn(turns: TurnStep[], currentStep: number): TurnStep | null {
  if (turns.length === 0) return null;
  // First turn the user hasn't passed yet
  for (const t of turns) {
    if (t.atIndex >= currentStep) return t;
  }
  return turns[turns.length - 1];
}

export function dirArrow(dir: TurnDir): string {
  switch (dir) {
    case "left":        return "↰";
    case "right":       return "↱";
    case "sharp-left":  return "↺";
    case "sharp-right": return "↻";
    case "u-turn":      return "⤴";
    case "arrive":      return "🏁";
    case "straight":
    default:            return "↑";
  }
}

export function dirLabel(dir: TurnDir, en: boolean): string {
  if (en) {
    switch (dir) {
      case "left":        return "Turn left";
      case "right":       return "Turn right";
      case "sharp-left":  return "Sharp left";
      case "sharp-right": return "Sharp right";
      case "u-turn":      return "Make a U-turn";
      case "arrive":      return "Arrive at destination";
      case "straight":    return "Continue straight";
    }
  } else {
    switch (dir) {
      case "left":        return "انعطف يسارًا";
      case "right":       return "انعطف يمينًا";
      case "sharp-left":  return "انعطف يسارًا بحدة";
      case "sharp-right": return "انعطف يمينًا بحدة";
      case "u-turn":      return "استدر";
      case "arrive":      return "الوصول إلى الوجهة";
      case "straight":    return "استمر للأمام";
    }
  }
}
