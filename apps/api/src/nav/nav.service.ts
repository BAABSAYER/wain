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
    const distance = dto.distance ??
      this.euclideanDistance(dto.fromX, dto.fromY, dto.toX, dto.toY);
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
    nodes: Array<{ id?: string; x: number; y: number; type: string }>,
    edges: Array<{ fromId: string; toId: string }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.navEdge.deleteMany({ where: { fromNode: { floorId } } });
      await tx.navNode.deleteMany({ where: { floorId } });

      const created = await Promise.all(
        nodes.map((n) =>
          tx.navNode.create({
            data: { floorId, x: n.x, y: n.y, type: n.type, z: 0 },
          }),
        ),
      );

      const idMap = new Map(nodes.map((n, i) => [n.id ?? String(i), created[i].id]));

      await Promise.all(
        edges.map((e) => {
          const fromId = idMap.get(e.fromId);
          const toId = idMap.get(e.toId);
          if (!fromId || !toId) return null;
          const fromNode = nodes.find((n) => n.id === e.fromId || nodes.indexOf(n) === Number(e.fromId));
          const toNode = nodes.find((n) => n.id === e.toId || nodes.indexOf(n) === Number(e.toId));
          const dist = fromNode && toNode
            ? this.euclideanDistance(fromNode.x, fromNode.y, toNode.x, toNode.y)
            : 1;
          return tx.navEdge.create({
            data: { fromNodeId: fromId, toNodeId: toId, distance: dist },
          });
        }).filter(Boolean),
      );
    });
    this.invalidateRouting();
    // Always return a JSON body — admin client uses res.json() and would
    // otherwise throw "Unexpected end of JSON input" on a 201 with no body.
    return { floorId, nodes: nodes.length, edges: edges.length };
  }

  private euclideanDistance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
}
