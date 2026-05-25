import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CacheService } from "../cache/cache.service";
import { CreateStoreDto } from "./dto/create-store.dto";

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findByFloor(floorId: string) {
    return this.prisma.store.findMany({ where: { floorId } });
  }

  search(buildingId: string, query: string) {
    return this.prisma.store.findMany({
      where: {
        isSearchable: true,
        floor: { buildingId },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { nameAr: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { floor: { select: { id: true, name: true, level: true } } },
    });
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return store;
  }

  async create(dto: CreateStoreDto) {
    const store = await this.prisma.store.create({ data: { ...dto, polygon: dto.polygon as any } });
    this.cache.delByPrefix("route:");
    return store;
  }

  async update(id: string, dto: Partial<CreateStoreDto>) {
    await this.findOne(id);
    const { polygon, ...rest } = dto;
    const store = await this.prisma.store.update({
      where: { id },
      data: polygon ? { ...rest, polygon: polygon as any } : rest,
    });
    this.cache.delByPrefix("route:");
    return store;
  }

  async remove(id: string) {
    await this.findOne(id);
    const store = await this.prisma.store.delete({ where: { id } });
    this.cache.delByPrefix("route:");
    return store;
  }
}
