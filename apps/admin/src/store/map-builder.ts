"use client";
import { create } from "zustand";
import type { DrawTool, CanvasStore, CanvasNode, CanvasEdge } from "@wain/types";

export type SelectionKind = "store" | "node" | "edge" | null;

interface MapBuilderState {
  tool: DrawTool;
  selectedId: string | null;
  selectedKind: SelectionKind;
  /** Additional rooms shift-clicked to form a multi-selection for bulk edits. */
  extraSelectedIds: string[];
  stores: CanvasStore[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  qrPoints: Array<{ id: string; nodeId: string; label: string }>;
  activePolygon: Array<{ x: number; y: number }>;
  /** When the "shape" tool is active, which preset to drop on next canvas click. */
  activePreset: string | null;
  isDirty: boolean;

  setTool: (tool: DrawTool) => void;
  setSelected: (id: string | null, kind?: SelectionKind) => void;
  /** Shift-click on a room: add/remove it from the extra multi-selection. */
  toggleExtraSelection: (id: string) => void;
  clearExtraSelection: () => void;
  /** Ctrl/Cmd+A — make every given id the active multi-selection at once. */
  selectAllStores: (ids: string[]) => void;

  addPolygonPoint: (pt: { x: number; y: number }) => void;
  commitPolygon: (store: Omit<CanvasStore, "polygon">) => void;
  clearActivePolygon: () => void;

  setActivePreset: (id: string | null) => void;
  addPresetStore: (store: CanvasStore) => void;

  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  removeNode: (id: string) => void;

  addEdge: (edge: CanvasEdge) => void;
  removeEdge: (id: string) => void;

  updateStore: (id: string, patch: Partial<CanvasStore>) => void;
  removeStore: (id: string) => void;

  loadFromApi: (stores: CanvasStore[], nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  markClean: () => void;
}

export const useMapBuilderStore = create<MapBuilderState>((set) => ({
  tool: "select",
  selectedId: null,
  selectedKind: null,
  extraSelectedIds: [],
  stores: [],
  nodes: [],
  edges: [],
  qrPoints: [],
  activePolygon: [],
  activePreset: null,
  isDirty: false,

  setTool: (tool) => set({
    tool,
    activePolygon: [],
    activePreset: null,
    selectedId: null,
    selectedKind: null,
    extraSelectedIds: [],
  }),
  setSelected: (id, kind = null) =>
    set({ selectedId: id, selectedKind: id ? kind : null, extraSelectedIds: [] }),
  toggleExtraSelection: (id) =>
    set((s) => {
      // Toggling the primary just promotes the first extra to primary (or clears
      // everything if there is none) — keeps the "remove this room from the
      // selection" gesture intuitive.
      if (s.selectedId === id) {
        const [next, ...rest] = s.extraSelectedIds;
        return next
          ? { selectedId: next, selectedKind: "store" as const, extraSelectedIds: rest }
          : { selectedId: null, selectedKind: null, extraSelectedIds: [] };
      }
      const present = s.extraSelectedIds.includes(id);
      const extraSelectedIds = present
        ? s.extraSelectedIds.filter((x) => x !== id)
        : [...s.extraSelectedIds, id];
      // If there is no primary yet, promote this click to primary.
      if (!s.selectedId) {
        return present
          ? { selectedId: null, selectedKind: null, extraSelectedIds }
          : { selectedId: id, selectedKind: "store" as const, extraSelectedIds: s.extraSelectedIds };
      }
      return { extraSelectedIds };
    }),
  clearExtraSelection: () => set({ extraSelectedIds: [] }),
  selectAllStores: (ids) => set(
    ids.length === 0
      ? { selectedId: null, selectedKind: null, extraSelectedIds: [] }
      : { selectedId: ids[0], selectedKind: "store" as const, extraSelectedIds: ids.slice(1) },
  ),

  addPolygonPoint: (pt) =>
    set((s) => ({ activePolygon: [...s.activePolygon, pt] })),

  commitPolygon: (storeData) =>
    set((s) => ({
      stores: [...s.stores, { ...storeData, polygon: s.activePolygon }],
      activePolygon: [],
      isDirty: true,
    })),

  clearActivePolygon: () => set({ activePolygon: [] }),

  setActivePreset: (id) => set({ activePreset: id }),

  addPresetStore: (store) =>
    set((s) => ({
      stores: [...s.stores, store],
      selectedId: store.id,
      selectedKind: "store",
      isDirty: true,
    })),

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node], isDirty: true })),

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      isDirty: true,
    })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.fromId !== id && e.toId !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedKind: s.selectedId === id ? null : s.selectedKind,
      isDirty: true,
    })),

  addEdge: (edge) =>
    set((s) => ({ edges: [...s.edges, edge], isDirty: true })),

  removeEdge: (id) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedKind: s.selectedId === id ? null : s.selectedKind,
      isDirty: true,
    })),

  updateStore: (id, patch) =>
    set((s) => ({
      stores: s.stores.map((st) => (st.id === id ? { ...st, ...patch } : st)),
      isDirty: true,
    })),

  removeStore: (id) =>
    set((s) => ({
      stores: s.stores.filter((st) => st.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      selectedKind: s.selectedId === id ? null : s.selectedKind,
      extraSelectedIds: s.extraSelectedIds.filter((x) => x !== id),
      isDirty: true,
    })),

  loadFromApi: (stores, nodes, edges) =>
    set({ stores, nodes, edges, isDirty: false, selectedId: null, selectedKind: null, extraSelectedIds: [], activePreset: null }),

  markClean: () => set({ isDirty: false }),
}));
