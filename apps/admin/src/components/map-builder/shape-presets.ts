/**
 * Preset room shapes for the map-builder. Each preset knows how to build a
 * polygon centered on a given point, defaulting to roughly 100-unit half-size
 * (so ~200 units wide on the floor canvas — fits nicely on a 2000×1400 floor).
 */
import type { Point2D } from "@wain/types";

export interface ShapePreset {
  id: string;
  label: string;
  icon: string;
  build(center: Point2D, halfSize?: number): Point2D[];
}

const DEFAULT_HALF = 100;

export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: "rect-wide",
    label: "Rectangle",
    icon: "▭",
    build: (c, s = DEFAULT_HALF) => [
      { x: c.x - s * 1.5, y: c.y - s },
      { x: c.x + s * 1.5, y: c.y - s },
      { x: c.x + s * 1.5, y: c.y + s },
      { x: c.x - s * 1.5, y: c.y + s },
    ],
  },
  {
    id: "square",
    label: "Square",
    icon: "□",
    build: (c, s = DEFAULT_HALF) => [
      { x: c.x - s, y: c.y - s },
      { x: c.x + s, y: c.y - s },
      { x: c.x + s, y: c.y + s },
      { x: c.x - s, y: c.y + s },
    ],
  },
  {
    id: "l-shape",
    label: "L-Shape",
    icon: "L",
    build: (c, s = DEFAULT_HALF) => [
      { x: c.x - s, y: c.y - s },
      { x: c.x + s, y: c.y - s },
      { x: c.x + s, y: c.y },
      { x: c.x,     y: c.y },
      { x: c.x,     y: c.y + s },
      { x: c.x - s, y: c.y + s },
    ],
  },
  {
    id: "t-shape",
    label: "T-Shape",
    icon: "T",
    build: (c, s = DEFAULT_HALF) => [
      { x: c.x - s * 1.5, y: c.y - s },
      { x: c.x + s * 1.5, y: c.y - s },
      { x: c.x + s * 1.5, y: c.y },
      { x: c.x + s * 0.5, y: c.y },
      { x: c.x + s * 0.5, y: c.y + s },
      { x: c.x - s * 0.5, y: c.y + s },
      { x: c.x - s * 0.5, y: c.y },
      { x: c.x - s * 1.5, y: c.y },
    ],
  },
  {
    id: "hex",
    label: "Hexagon",
    icon: "⬡",
    build: (c, s = DEFAULT_HALF) => {
      return Array.from({ length: 6 }, (_, i) => {
        const theta = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return { x: c.x + Math.cos(theta) * s, y: c.y + Math.sin(theta) * s };
      });
    },
  },
  {
    id: "circle",
    label: "Circle",
    icon: "○",
    build: (c, s = DEFAULT_HALF) => {
      const sides = 24;
      return Array.from({ length: sides }, (_, i) => {
        const theta = (i / sides) * Math.PI * 2;
        return { x: c.x + Math.cos(theta) * s, y: c.y + Math.sin(theta) * s };
      });
    },
  },
];

export function findPreset(id: string | null): ShapePreset | null {
  if (!id) return null;
  return SHAPE_PRESETS.find((p) => p.id === id) ?? null;
}
