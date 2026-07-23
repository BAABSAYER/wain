import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateFloorDto } from "./dto/create-floor.dto";
import { DuplicateFloorDto } from "./dto/duplicate-floor.dto";

@Injectable()
export class FloorsService {
  constructor(private readonly prisma: PrismaService) {}

  findByBuilding(buildingId: string) {
    return this.prisma.floor.findMany({
      where: { buildingId },
      orderBy: { level: "asc" },
      include: { stores: true, assets: true, outdoorFeatures: true, navNodes: { include: { edgesFrom: true } } },
    });
  }

  async findOne(id: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id },
      include: {
        stores: { include: { navLinks: { select: { navNodeId: true } } } },
        assets: true,
        outdoorFeatures: true,
        navNodes: { include: { edgesFrom: true } },
      },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  create(dto: CreateFloorDto) {
    return this.prisma.floor.create({ data: dto });
  }

  async duplicate(id: string, dto: DuplicateFloorDto) {
    const name = dto.name.trim();
    const nameAr = dto.nameAr.trim();
    if (!name || !nameAr) throw new BadRequestException("Floor names are required");

    return this.prisma.$transaction(async (tx) => {
      const source = await tx.floor.findUnique({
        where: { id },
        include: {
          stores: { include: { navLinks: { select: { navNodeId: true } } } },
          assets: true,
          outdoorFeatures: true,
          navNodes: { include: { edgesFrom: true } },
        },
      });
      if (!source) throw new NotFoundException(`Floor ${id} not found`);

      const levelTaken = await tx.floor.findUnique({
        where: { buildingId_level: { buildingId: source.buildingId, level: dto.level } },
        select: { id: true },
      });
      if (levelTaken) throw new BadRequestException(`Level ${dto.level} already exists in this building`);

      const duplicate = await tx.floor.create({
        data: {
          buildingId: source.buildingId,
          name,
          nameAr,
          level: dto.level,
          width: source.width,
          height: source.height,
          floorPlanUrl: source.floorPlanUrl,
        },
      });

      const nodeIds = new Map<string, string>();
      for (const node of source.navNodes) {
        const created = await tx.navNode.create({
          data: {
            floorId: duplicate.id,
            x: node.x,
            y: node.y,
            z: node.z,
            type: node.type,
            connectedFloorNodeId: null,
          },
          select: { id: true },
        });
        nodeIds.set(node.id, created.id);
      }

      const localEdges = source.navNodes.flatMap((node) =>
        node.edgesFrom.flatMap((edge) => {
          const fromNodeId = nodeIds.get(edge.fromNodeId);
          const toNodeId = nodeIds.get(edge.toNodeId);
          return fromNodeId && toNodeId
            ? [{ fromNodeId, toNodeId, distance: edge.distance, isAccessible: edge.isAccessible }]
            : [];
        }),
      );
      if (localEdges.length) await tx.navEdge.createMany({ data: localEdges, skipDuplicates: true });

      for (const store of source.stores) {
        const linkedNodeIds = [
          ...new Set(store.navLinks.map((link) => nodeIds.get(link.navNodeId)).filter((nodeId): nodeId is string => !!nodeId)),
        ];
        await tx.store.create({
          data: {
            floorId: duplicate.id,
            name: store.name,
            nameAr: store.nameAr,
            category: store.category,
            zone: store.zone,
            zoneAr: store.zoneAr,
            logoUrl: store.logoUrl,
            polygon: store.polygon as any,
            extrudeHeight: store.extrudeHeight,
            color: store.color,
            isSearchable: store.isSearchable,
            navNodeId: store.navNodeId ? nodeIds.get(store.navNodeId) ?? null : null,
            navLinks: linkedNodeIds.length
              ? { create: linkedNodeIds.map((navNodeId) => ({ navNodeId })) }
              : undefined,
          },
        });
      }

      if (source.assets.length) {
        await tx.asset.createMany({
          data: source.assets.map((asset) => ({
            floorId: duplicate.id,
            type: asset.type,
            label: asset.label,
            x: asset.x,
            y: asset.y,
            z: asset.z,
            rotation: asset.rotation,
            scale: asset.scale,
            color: asset.color,
            modelUrl: asset.modelUrl,
            navNodeId: asset.navNodeId ? nodeIds.get(asset.navNodeId) ?? null : null,
          })),
        });
      }

      if (source.outdoorFeatures.length) {
        await tx.outdoorFeature.createMany({
          data: source.outdoorFeatures.map((feature) => ({
            floorId: duplicate.id,
            type: feature.type,
            label: feature.label,
            points: feature.points as any,
            width: feature.width,
            color: feature.color,
            lineColor: feature.lineColor,
            laneCount: feature.laneCount,
            parkingAngle: feature.parkingAngle,
            stallWidth: feature.stallWidth,
            stallDepth: feature.stallDepth,
          })),
        });
      }

      return tx.floor.findUnique({
        where: { id: duplicate.id },
        include: { stores: true, assets: true, outdoorFeatures: true, navNodes: { include: { edgesFrom: true } } },
      });
    }, { timeout: 30_000 });
  }

  async update(id: string, dto: Partial<CreateFloorDto>) {
    await this.findOne(id);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.floor.delete({ where: { id } });
  }
}
