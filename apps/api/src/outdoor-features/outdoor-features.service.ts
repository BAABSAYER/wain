import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateOutdoorFeatureDto } from "./dto/create-outdoor-feature.dto";

@Injectable()
export class OutdoorFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  findByFloor(floorId: string) {
    return this.prisma.outdoorFeature.findMany({ where: { floorId }, orderBy: { createdAt: "asc" } });
  }

  async bulkSave(floorId: string, features: Array<Partial<CreateOutdoorFeatureDto>>) {
    await this.prisma.floor.findUniqueOrThrow({ where: { id: floorId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.outdoorFeature.deleteMany({ where: { floorId } });
      if (features.length) {
        await tx.outdoorFeature.createMany({
          data: features.map((feature) => ({
            floorId,
            type: feature.type ?? "road",
            label: feature.label ?? "",
            points: (feature.points ?? []) as any,
            width: Number(feature.width ?? 40),
            color: feature.color || null,
            lineColor: feature.lineColor || null,
            laneCount: Number(feature.laneCount ?? 2),
            parkingAngle: Number(feature.parkingAngle ?? 90),
            stallWidth: Number(feature.stallWidth ?? 24),
            stallDepth: Number(feature.stallDepth ?? 48),
          })),
        });
      }
    });
    return this.findByFloor(floorId);
  }
}
