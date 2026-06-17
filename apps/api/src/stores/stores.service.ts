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
    return this.prisma.store.findMany({
      where: { floorId },
      include: { navLinks: { select: { navNodeId: true } } },
    });
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

  /**
   * Replace the full set of nav nodes a store is linked to. Also keeps the
   * legacy Store.navNodeId in sync (set to the first id, or null if the list
   * is empty) so any older code reading navNodeId still works.
   */
  async setNavLinks(storeId: string, navNodeIds: string[]) {
    await this.findOne(storeId);
    const unique = [...new Set(navNodeIds.filter(Boolean))];
    await this.prisma.$transaction(async (tx) => {
      await tx.storeNavLink.deleteMany({ where: { storeId } });
      if (unique.length > 0) {
        await tx.storeNavLink.createMany({
          data: unique.map((navNodeId) => ({ storeId, navNodeId })),
          skipDuplicates: true,
        });
      }
      await tx.store.update({
        where: { id: storeId },
        data: { navNodeId: unique[0] ?? null },
      });
    });
    this.cache.delByPrefix("route:");
    return this.prisma.store.findUnique({
      where: { id: storeId },
      include: { navLinks: { include: { navNode: true } } },
    });
  }
}
