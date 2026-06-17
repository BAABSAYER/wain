"use client";
import { create } from "zustand";
import type { DrawTool, CanvasStore, CanvasNode, CanvasEdge } from "@wain/types";

export type SelectionKind = "store" | "node" | "edge" | null;

/** Frozen snapshot of the geometry; what undo / redo restore. */
interface HistorySnapshot {
  stores: CanvasStore[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
const HISTORY_LIMIT = 50;

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
  /** Snap drags / preset drops to the nearest 10-unit grid when true. */
  gridSnap: boolean;
  setGridSnap: (on: boolean) => void;
  /** When set, the canvas is in "click a nav node to add/remove from this
   *  store's link list" mode. Other interactions are suppressed. */
  linkModeStoreId: string | null;
  enterLinkMode: (storeId: string) => void;
  exitLinkMode: () => void;
  /** Toggle membership of nodeId in the given store's navLinkNodeIds list. */
  toggleStoreNavLink: (storeId: string, nodeId: string) => void;
  /** Set the full list (used when the picker deletes / clears all links). */
  setStoreNavLinks: (storeId: string, nodeIds: string[]) => void;
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
  /** Move room to the very top of the z-stack (rendered last). */
  bringStoreToFront: (id: string) => void;
  /** Move room to the very bottom of the z-stack (rendered first). */
  sendStoreToBack: (id: string) => void;

  // ── Undo / Redo ────────────────────────────────────────────────────────
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  /** Call BEFORE a discrete user action (or before a drag) so undo restores
   *  the state from right before that action. */
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;

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
  gridSnap: false,
  linkModeStoreId: null,
  isDirty: false,
  past: [],
  future: [],

  setTool: (tool) => set({
    tool,
    activePolygon: [],
    activePreset: null,
    selectedId: null,
    selectedKind: null,
    extraSelectedIds: [],
    linkModeStoreId: null,
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
  setGridSnap: (on) => set({ gridSnap: on }),

  enterLinkMode: (storeId) => set({ linkModeStoreId: storeId }),
  exitLinkMode: () => set({ linkModeStoreId: null }),
  toggleStoreNavLink: (storeId, nodeId) =>
    set((s) => ({
      stores: s.stores.map((st) => {
        if (st.id !== storeId) return st;
        const current = st.navLinkNodeIds ?? (st.navNodeId ? [st.navNodeId] : []);
        const has = current.includes(nodeId);
        const next = has ? current.filter((id) => id !== nodeId) : [...current, nodeId];
        return { ...st, navLinkNodeIds: next, navNodeId: next[0] ?? null };
      }),
      isDirty: true,
    })),
  setStoreNavLinks: (storeId, nodeIds) =>
    set((s) => ({
      stores: s.stores.map((st) =>
        st.id === storeId
          ? { ...st, navLinkNodeIds: nodeIds, navNodeId: nodeIds[0] ?? null }
          : st,
      ),
      isDirty: true,
    })),

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

  bringStoreToFront: (id) =>
    set((s) => {
      const target = s.stores.find((st) => st.id === id);
      if (!target) return s;
      return {
        stores: [...s.stores.filter((st) => st.id !== id), target],
        isDirty: true,
      };
    }),

  sendStoreToBack: (id) =>
    set((s) => {
      const target = s.stores.find((st) => st.id === id);
      if (!target) return s;
      return {
        stores: [target, ...s.stores.filter((st) => st.id !== id)],
        isDirty: true,
      };
    }),

  pushSnapshot: () =>
    set((s) => ({
      past: [...s.past, { stores: s.stores, nodes: s.nodes, edges: s.edges }].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      const current: HistorySnapshot = { stores: s.stores, nodes: s.nodes, edges: s.edges };
      return {
        past: s.past.slice(0, -1),
        future: [current, ...s.future].slice(0, HISTORY_LIMIT),
        stores: previous.stores,
        nodes: previous.nodes,
        edges: previous.edges,
        isDirty: true,
        // Drop selections that no longer exist post-undo.
        selectedId: previous.stores.some((st) => st.id === s.selectedId)
                 || previous.nodes.some((n) => n.id === s.selectedId)
                 || previous.edges.some((e) => e.id === s.selectedId) ? s.selectedId : null,
        selectedKind: previous.stores.some((st) => st.id === s.selectedId)
                   || previous.nodes.some((n) => n.id === s.selectedId)
                   || previous.edges.some((e) => e.id === s.selectedId) ? s.selectedKind : null,
        extraSelectedIds: s.extraSelectedIds.filter((id) => previous.stores.some((st) => st.id === id)),
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      const current: HistorySnapshot = { stores: s.stores, nodes: s.nodes, edges: s.edges };
      return {
        past: [...s.past, current].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        stores: next.stores,
        nodes: next.nodes,
        edges: next.edges,
        isDirty: true,
        selectedId: next.stores.some((st) => st.id === s.selectedId)
                 || next.nodes.some((n) => n.id === s.selectedId)
                 || next.edges.some((e) => e.id === s.selectedId) ? s.selectedId : null,
        selectedKind: next.stores.some((st) => st.id === s.selectedId)
                   || next.nodes.some((n) => n.id === s.selectedId)
                   || next.edges.some((e) => e.id === s.selectedId) ? s.selectedKind : null,
        extraSelectedIds: s.extraSelectedIds.filter((id) => next.stores.some((st) => st.id === id)),
      };
    }),

  loadFromApi: (stores, nodes, edges) =>
    set({
      stores, nodes, edges, isDirty: false,
      selectedId: null, selectedKind: null, extraSelectedIds: [],
      activePreset: null, linkModeStoreId: null, past: [], future: [],
    }),

  markClean: () => set({ isDirty: false }),
}));
