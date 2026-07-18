import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CacheService } from "../cache/cache.service";
import { CreateNodeDto } from "./dto/create-node.dto";
import { CreateEdgeDto } from "./dto/create-edge.dto";

@Injectable()
export class NavService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Drop cached graphs + routes — any graph edit can change every route. */
  private invalidateRouting() {
    this.cache.delByPrefix("graph:");
    this.cache.delByPrefix("route:");
  }

  getGraphForBuilding(buildingId: string) {
    return this.prisma.navNode.findMany({
      where: { floor: { buildingId } },
      include: { edgesFrom: true },
    });
  }

  async createNode(dto: CreateNodeDto) {
    const node = await this.prisma.navNode.create({ data: dto });
    this.invalidateRouting();
    return node;
  }

  async updateNode(id: string, dto: Partial<CreateNodeDto>) {
    const node = await this.prisma.navNode.update({ where: { id }, data: dto });
    this.invalidateRouting();
    return node;
  }

  async deleteNode(id: string) {
    const node = await this.prisma.navNode.delete({ where: { id } });
    this.invalidateRouting();
    return node;
  }

  async createEdge(dto: CreateEdgeDto) {
    let distance = dto.distance;
    if (distance === undefined) {
      if (
        dto.fromX !== undefined && dto.fromY !== undefined &&
        dto.toX !== undefined && dto.toY !== undefined
      ) {
        distance = this.euclideanDistance(dto.fromX, dto.fromY, dto.toX, dto.toY);
      } else {
        const [from, to] = await Promise.all([
          this.prisma.navNode.findUnique({ where: { id: dto.fromNodeId }, select: { x: true, y: true } }),
          this.prisma.navNode.findUnique({ where: { id: dto.toNodeId }, select: { x: true, y: true } }),
        ]);
        distance = from && to ? this.euclideanDistance(from.x, from.y, to.x, to.y) : 1;
      }
    }
    const edge = await this.prisma.navEdge.create({
      data: {
        fromNodeId: dto.fromNodeId,
        toNodeId: dto.toNodeId,
        distance,
        isAccessible: dto.isAccessible ?? true,
      },
    });
    this.invalidateRouting();
    return edge;
  }

  async deleteEdge(id: string) {
    const edge = await this.prisma.navEdge.delete({ where: { id } });
    this.invalidateRouting();
    return edge;
  }

  async bulkSaveGraph(
    floorId: string,
    nodes: Array<{ id?: string; x: number; y: number; type: string; connectedFloorNodeId?: string | null }>,
    edges: Array<{ fromId: string; toId: string }>,
  ) {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      select: { buildingId: true },
    });
    if (!floor) throw new NotFoundException(`Floor ${floorId} not found`);

    // UPSERT semantics, not delete+recreate. Nodes that existed and are still
    // in the incoming list keep their DB ids; new ones get fresh ids; ones
    // that disappeared get deleted (cleanly nulling any Store.navNodeId that
    // pointed at them). This preserves Store→NavNode links across saves so
    // the admin's nodeIdMap remap is just an identity map for existing rows.
    const existing = await this.prisma.navNode.findMany({ where: { floorId } });
    const existingIds = new Set(existing.map((n) => n.id));
    const incomingExistingIds = new Set(
      nodes.filter((n) => n.id && existingIds.has(n.id)).map((n) => n.id!),
    );
    const toDelete = [...existingIds].filter((id) => !incomingExistingIds.has(id));

    let idMapObj: Record<string, string> = {};
    await this.prisma.$transaction(async (tx) => {
      // Clear FKs into nodes that are about to disappear so the deleteMany
      // doesn't get blocked by RESTRICT.
      if (toDelete.length > 0) {
        await tx.store.updateMany({
          where: { navNodeId: { in: toDelete } },
          data: { navNodeId: null },
        });
      }
      // Edges always get rebuilt — they're cheap, and their ids don't
      // matter to anyone outside the routing engine.
      await tx.navEdge.deleteMany({ where: { fromNode: { floorId } } });
      const buildingEdges = await tx.navEdge.findMany({
        where: { fromNode: { floor: { buildingId: floor.buildingId } } },
        select: {
          id: true,
          fromNode: { select: { floorId: true } },
          toNode: { select: { floorId: true } },
        },
      });
      const crossFloorEdgeIds = buildingEdges
        .filter((e) => e.fromNode.floorId !== e.toNode.floorId)
        .map((e) => e.id);
      if (crossFloorEdgeIds.length > 0) {
        await tx.navEdge.deleteMany({ where: { id: { in: crossFloorEdgeIds } } });
      }
      if (toDelete.length > 0) {
        await tx.navNode.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Apply updates / creates. Build the id map as we go.
      const idMap = new Map<string, string>();
      for (const n of nodes) {
        if (n.id && existingIds.has(n.id)) {
          await tx.navNode.update({
            where: { id: n.id },
            data: {
              x: n.x,
              y: n.y,
              type: n.type,
              z: 0,
              connectedFloorNodeId: n.connectedFloorNodeId || null,
            },
          });
          idMap.set(n.id, n.id); // identity — link survives
        } else {
          const created = await tx.navNode.create({
            data: {
              floorId,
              x: n.x,
              y: n.y,
              type: n.type,
              z: 0,
              connectedFloorNodeId: n.connectedFloorNodeId || null,
            },
          });
          idMap.set(n.id ?? `__idx_${idMap.size}`, created.id);
        }
      }
      idMapObj = Object.fromEntries(idMap);

      // Recreate edges using the (mostly identity) id map.
      await Promise.all(
        edges.map((e) => {
          const fromId = idMap.get(e.fromId);
          const toId = idMap.get(e.toId);
          if (!fromId || !toId) return null;
          const fromNode = nodes.find((n) => n.id === e.fromId);
          const toNode = nodes.find((n) => n.id === e.toId);
          const dist = fromNode && toNode
            ? this.euclideanDistance(fromNode.x, fromNode.y, toNode.x, toNode.y)
            : 1;
          return tx.navEdge.create({
            data: { fromNodeId: fromId, toNodeId: toId, distance: dist },
          });
        }).filter(Boolean),
      );

      const buildingNodes = await tx.navNode.findMany({
        where: { floor: { buildingId: floor.buildingId } },
        select: { id: true, floorId: true, type: true, connectedFloorNodeId: true },
      });
      const nodeById = new Map(buildingNodes.map((n) => [n.id, n]));
      const transitionEdges = buildingNodes.flatMap((n) => {
        if (!n.connectedFloorNodeId) return [];
        const target = nodeById.get(n.connectedFloorNodeId);
        if (!target || target.floorId === n.floorId) return [];
        const distance = n.type === "elevator" ? 30 : 20;
        const isAccessible = n.type === "elevator";
        return [
          { fromNodeId: n.id, toNodeId: target.id, distance, isAccessible },
          { fromNodeId: target.id, toNodeId: n.id, distance, isAccessible },
        ];
      });
      if (transitionEdges.length > 0) {
        await tx.navEdge.createMany({ data: transitionEdges, skipDuplicates: true });
      }
    });
    this.invalidateRouting();
    return {
      floorId,
      nodes: nodes.length,
      edges: edges.length,
      // Mostly identity now (existing ids → themselves); only newly-created
      // nodes show a different value. Kept for backward compatibility with
      // the admin's remap loop, which becomes a no-op for unchanged nodes.
      nodeIdMap: idMapObj,
    };
  }

  private euclideanDistance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
}
