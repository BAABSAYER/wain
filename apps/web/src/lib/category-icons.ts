/** Category → glyph (single character) used both in 3D scene and overlay UI. */
export const CATEGORY_GLYPH: Record<string, string> = {
  medical:       "✚",
  retail:        "♣",
  food:          "☕",
  services:      "ⓘ",
  restroom:      "🚻",
  elevator:      "▦",
  stairs:        "▲",
  escalator:     "⇅",
  entrance:      "⌂",
  parking:       "P",
  education:     "🎓",
  transit:       "🚏",
  other:         "•",
};

export function categoryGlyph(category: string | undefined | null): string {
  if (!category) return "•";
  return CATEGORY_GLYPH[category] ?? "•";
}

/** Returns true for categories representing open/walkable space (not extruded rooms). */
export function isOpenSpace(category: string | undefined | null): boolean {
  return category === "other";
}
