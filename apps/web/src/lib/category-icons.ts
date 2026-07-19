/** Category glyphs used by the map and overlay UI. Keep these compact so they
 * fit inside small room badges on mobile. */
export const CATEGORY_GLYPH: Record<string, string> = {
  medical: "+",
  retail: "R",
  food: "F",
  services: "i",
  restroom: "WC",
  elevator: "E",
  stairs: "S",
  escalator: "ES",
  entrance: "IN",
  parking: "P",
  education: "ED",
  transit: "T",
  other: ".",
};

export const CATEGORY_VISUALS: Record<string, { glyph: string; accent: string; fill: string; label: string }> = {
  medical: { glyph: CATEGORY_GLYPH.medical, accent: "#e11d48", fill: "#fff1f2", label: "Medical" },
  retail: { glyph: CATEGORY_GLYPH.retail, accent: "#059669", fill: "#ecfdf5", label: "Retail" },
  food: { glyph: CATEGORY_GLYPH.food, accent: "#d97706", fill: "#fffbeb", label: "Food" },
  services: { glyph: CATEGORY_GLYPH.services, accent: "#0284c7", fill: "#f0f9ff", label: "Services" },
  education: { glyph: CATEGORY_GLYPH.education, accent: "#7c3aed", fill: "#f5f3ff", label: "Education" },
  transit: { glyph: CATEGORY_GLYPH.transit, accent: "#0891b2", fill: "#ecfeff", label: "Transit" },
  restroom: { glyph: CATEGORY_GLYPH.restroom, accent: "#4f46e5", fill: "#eef2ff", label: "Restroom" },
  elevator: { glyph: CATEGORY_GLYPH.elevator, accent: "#7c3aed", fill: "#f5f3ff", label: "Elevator" },
  stairs: { glyph: CATEGORY_GLYPH.stairs, accent: "#16a34a", fill: "#f0fdf4", label: "Stairs" },
  escalator: { glyph: CATEGORY_GLYPH.escalator, accent: "#0d9488", fill: "#f0fdfa", label: "Escalator" },
  entrance: { glyph: CATEGORY_GLYPH.entrance, accent: "#0f766e", fill: "#f0fdfa", label: "Entrance" },
  parking: { glyph: CATEGORY_GLYPH.parking, accent: "#2563eb", fill: "#eff6ff", label: "Parking" },
  other: { glyph: CATEGORY_GLYPH.other, accent: "#64748b", fill: "#f8fafc", label: "Place" },
};

export function categoryGlyph(category: string | undefined | null): string {
  if (!category) return CATEGORY_GLYPH.other;
  return CATEGORY_GLYPH[category] ?? CATEGORY_GLYPH.other;
}

export function categoryVisual(category: string | undefined | null) {
  return CATEGORY_VISUALS[category ?? ""] ?? CATEGORY_VISUALS.other;
}

/** Returns true for categories representing open/walkable space, not rooms. */
export function isOpenSpace(_category: string | undefined | null): boolean {
  return false;
}
