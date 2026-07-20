import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateAssetDto } from "./dto/create-asset.dto";

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  findByFloor(floorId: string) {
    return this.prisma.asset.findMany({ where: { floorId }, orderBy: { createdAt: "asc" } });
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  create(dto: CreateAssetDto) {
    return this.prisma.asset.create({ data: this.cleanCreate(dto) });
  }

  async update(id: string, dto: Partial<CreateAssetDto>) {
    await this.findOne(id);
    return this.prisma.asset.update({ where: { id }, data: this.cleanPatch(dto) });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.asset.delete({ where: { id } });
  }

  async bulkSaveFloor(floorId: string, assets: Array<Partial<CreateAssetDto> & { id?: string }>) {
    await this.prisma.floor.findUniqueOrThrow({ where: { id: floorId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.deleteMany({ where: { floorId } });
      if (assets.length > 0) {
        await tx.asset.createMany({
          data: assets.map((asset) => this.cleanCreate({ ...asset, floorId })),
        });
      }
    });
    return this.findByFloor(floorId);
  }

  private cleanCreate(dto: Partial<CreateAssetDto>) {
    return {
      floorId: dto.floorId!,
      type: dto.type ?? "sign",
      label: dto.label ?? "",
      x: Number(dto.x ?? 0),
      y: Number(dto.y ?? 0),
      z: Number(dto.z ?? 0),
      rotation: Number(dto.rotation ?? 0),
      scale: Number(dto.scale ?? 1),
      color: dto.color || null,
      modelUrl: dto.modelUrl || null,
      navNodeId: dto.navNodeId || null,
    };
  }

  private cleanPatch(dto: Partial<CreateAssetDto>) {
    const data: Record<string, unknown> = {};
    if (dto.floorId !== undefined) data.floorId = dto.floorId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.label !== undefined) data.label = dto.label ?? "";
    if (dto.x !== undefined) data.x = Number(dto.x);
    if (dto.y !== undefined) data.y = Number(dto.y);
    if (dto.z !== undefined) data.z = Number(dto.z);
    if (dto.rotation !== undefined) data.rotation = Number(dto.rotation);
    if (dto.scale !== undefined) data.scale = Number(dto.scale);
    if (dto.color !== undefined) data.color = dto.color || null;
    if (dto.modelUrl !== undefined) data.modelUrl = dto.modelUrl || null;
    if (dto.navNodeId !== undefined) data.navNodeId = dto.navNodeId || null;
    return data;
  }
}
