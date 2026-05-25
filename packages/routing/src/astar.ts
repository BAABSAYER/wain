export interface GraphNode {
  id: string;
  x: number;
  y: number;
  z: number;
  floorId: string;
  type: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  distance: number;
  isAccessible: boolean;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, Array<{ nodeId: string; distance: number; isAccessible: boolean }>>;
}

export function buildGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  const nodeMap = new Map<string, GraphNode>();
  const adjacency = new Map<string, Array<{ nodeId: string; distance: number; isAccessible: boolean }>>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push({ nodeId: edge.to, distance: edge.distance, isAccessible: edge.isAccessible });
    adjacency.get(edge.to)?.push({ nodeId: edge.from, distance: edge.distance, isAccessible: edge.isAccessible });
  }

  return { nodes: nodeMap, adjacency };
}

function heuristic(a: GraphNode, b: GraphNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z - b.z) * 10;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface AStarResult {
  path: string[];
  totalDistance: number;
  found: boolean;
}

export function aStar(
  graph: Graph,
  startId: string,
  goalId: string,
  accessibleOnly = false,
): AStarResult {
  const start = graph.nodes.get(startId);
  const goal = graph.nodes.get(goalId);

  if (!start || !goal) return { path: [], totalDistance: 0, found: false };
  if (startId === goalId) return { path: [startId], totalDistance: 0, found: true };

  const openSet = new Set<string>([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, heuristic(start, goal)]]);

  while (openSet.size > 0) {
    const current = [...openSet].reduce((a, b) =>
      (fScore.get(a) ?? Infinity) < (fScore.get(b) ?? Infinity) ? a : b
    );

    if (current === goalId) {
      const path: string[] = [];
      let node = current;
      while (node) {
        path.unshift(node);
        node = cameFrom.get(node)!;
      }
      return { path, totalDistance: gScore.get(current) ?? 0, found: true };
    }

    openSet.delete(current);

    for (const neighbor of graph.adjacency.get(current) ?? []) {
      if (accessibleOnly && !neighbor.isAccessible) continue;

      const tentativeG = (gScore.get(current) ?? Infinity) + neighbor.distance;

      if (tentativeG < (gScore.get(neighbor.nodeId) ?? Infinity)) {
        cameFrom.set(neighbor.nodeId, current);
        gScore.set(neighbor.nodeId, tentativeG);
        const neighborNode = graph.nodes.get(neighbor.nodeId)!;
        fScore.set(neighbor.nodeId, tentativeG + heuristic(neighborNode, goal));
        openSet.add(neighbor.nodeId);
      }
    }
  }

  return { path: [], totalDistance: 0, found: false };
}

export function reconstructRoute(
  path: string[],
  graph: Graph,
): Array<{ nodeId: string; floorId: string; x: number; y: number; z: number }> {
  return path.map((id) => {
    const node = graph.nodes.get(id)!;
    return { nodeId: id, floorId: node.floorId, x: node.x, y: node.y, z: node.z };
  });
}

export function estimateWalkingMinutes(distanceMeters: number): number {
  const walkingSpeedMps = 1.4;
  return Math.ceil(distanceMeters / walkingSpeedMps / 60);
}
