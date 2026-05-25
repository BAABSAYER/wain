import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CacheService } from "../cache/cache.service";
import { buildGraph, aStar, reconstructRoute, estimateWalkingMinutes, GraphNode, GraphEdge } from "@wain/routing";

type BuiltGraph = ReturnType<typeof buildGraph>;

// The nav graph only changes when an admin edits routing; routes are pure
// functions of it. TTLs are a safety net on top of explicit invalidation.
const GRAPH_TTL_MS = 5 * 60 * 1000;
const ROUTE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getRoute(fromNodeId: string, toStoreId: string, accessibleOnly = false) {
    // Identical (origin, destination, accessibility) requests — e.g. the same QR
    // scanned to the same popular store — are served straight from cache.
    const routeKey = `route:${fromNodeId}:${toStoreId}:${accessibleOnly}`;
    const cachedRoute = this.cache.get<unknown>(routeKey);
    if (cachedRoute) return cachedRoute;

    const store = await this.prisma.store.findUnique({
      where: { id: toStoreId },
      include: { floor: true, navNode: true },
    });
    if (!store) throw new NotFoundException(`Store ${toStoreId} not found`);
    if (!store.navNodeId) throw new BadRequestException(`Store "${store.name}" has no nav node assigned`);

    const fromNode = await this.prisma.navNode.findUnique({ where: { id: fromNodeId } });
    if (!fromNode) throw new NotFoundException(`Start node ${fromNodeId} not found`);

    const buildingId = store.floor.buildingId;
    const graph = await this.getGraph(buildingId);

    const result = aStar(graph, fromNodeId, store.navNodeId, accessibleOnly);

    if (!result.found) {
      throw new BadRequestException("No route found between the two points");
    }

    const steps = reconstructRoute(result.path, graph);
    const uniqueFloors = [...new Set(steps.map((s) => s.floorId))];

    const route = {
      steps,
      totalDistance: result.totalDistance,
      estimatedMinutes: estimateWalkingMinutes(result.totalDistance),
      floors: uniqueFloors,
      destination: {
        id: store.id,
        name: store.name,
        nameAr: store.nameAr,
        category: store.category,
        color: store.color,
      },
    };

    this.cache.set(routeKey, route, ROUTE_TTL_MS);
    return route;
  }

  /** The full building nav graph — loaded from DB once, then served from cache. */
  private async getGraph(buildingId: string): Promise<BuiltGraph> {
    const graphKey = `graph:${buildingId}`;
    const cached = this.cache.get<BuiltGraph>(graphKey);
    if (cached) return cached;

    const [dbNodes, dbEdges] = await Promise.all([
      this.prisma.navNode.findMany({ where: { floor: { buildingId } } }),
      this.prisma.navEdge.findMany({ where: { fromNode: { floor: { buildingId } } } }),
    ]);

    const graphNodes: GraphNode[] = dbNodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      z: n.z,
      floorId: n.floorId,
      type: n.type,
    }));

    const graphEdges: GraphEdge[] = dbEdges.map((e) => ({
      from: e.fromNodeId,
      to: e.toNodeId,
      distance: e.distance,
      isAccessible: e.isAccessible,
    }));

    const graph = buildGraph(graphNodes, graphEdges);
    this.cache.set(graphKey, graph, GRAPH_TTL_MS);
    return graph;
  }
}
