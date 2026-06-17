"use client";
import type { CanvasStore } from "@wain/types";

/**
 * Cross-floor clipboard for map-builder rooms. Lives in localStorage so a
 * user can Ctrl+C on Floor A, navigate to Floor B's builder, and Ctrl+V to
 * land copies of those rooms on the new floor.
 *
 * Polygons keep the same coordinate space (no rescaling between floors) —
 * the user can drag them after pasting if they need to fit a different
 * layout.
 */
const CLIPBOARD_KEY = "wain.mapBuilder.clipboard.v1";

export function copyToClipboard(stores: CanvasStore[]) {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(stores));
  } catch {
    /* over-quota / private mode — silently ignore */
  }
}

export function pasteFromClipboard(): CanvasStore[] {
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clipboardHasContent(): boolean {
  return pasteFromClipboard().length > 0;
}
