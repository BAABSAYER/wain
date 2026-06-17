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
      include: {
        floor: true,
        navNode: true,
        // M:N linked nodes — a store with two entrances routes to whichever
        // is shortest from this origin.
        navLinks: { include: { navNode: true } },
      },
    });
    if (!store) throw new NotFoundException(`Store ${toStoreId} not found`);

    // Build the candidate-target list: every M:N linked node + the legacy
    // primary navNodeId (deduped). If none, the store isn't routable.
    const targetIds = [
      ...store.navLinks.map((l) => l.navNodeId),
      ...(store.navNodeId ? [store.navNodeId] : []),
    ];
    const uniqueTargets = [...new Set(targetIds)];
    if (uniqueTargets.length === 0) {
      throw new BadRequestException(`Store "${store.name}" has no nav node linked`);
    }

    const fromNode = await this.prisma.navNode.findUnique({ where: { id: fromNodeId } });
    if (!fromNode) throw new NotFoundException(`Start node ${fromNodeId} not found`);

    const buildingId = store.floor.buildingId;
    const graph = await this.getGraph(buildingId);

    // Try A* to each candidate target; keep the shortest found route. This
    // gives "any door" routing — visitors automatically arrive at whichever
    // entrance is closest to where they scanned.
    let best: { path: string[]; totalDistance: number } | null = null;
    for (const targetId of uniqueTargets) {
      const r = aStar(graph, fromNodeId, targetId, accessibleOnly);
      if (r.found && (!best || r.totalDistance < best.totalDistance)) {
        best = { path: r.path, totalDistance: r.totalDistance };
      }
    }
    if (!best) {
      throw new BadRequestException("No route found between the two points");
    }

    const steps = reconstructRoute(best.path, graph);
    const uniqueFloors = [...new Set(steps.map((s) => s.floorId))];

    const route = {
      steps,
      totalDistance: best.totalDistance,
      estimatedMinutes: estimateWalkingMinutes(best.totalDistance),
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
