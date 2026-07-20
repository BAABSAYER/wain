import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateFloorDto } from "./dto/create-floor.dto";

@Injectable()
export class FloorsService {
  constructor(private readonly prisma: PrismaService) {}

  findByBuilding(buildingId: string) {
    return this.prisma.floor.findMany({
      where: { buildingId },
      orderBy: { level: "asc" },
      include: { stores: true, assets: true, navNodes: { include: { edgesFrom: true } } },
    });
  }

  async findOne(id: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id },
      include: {
        stores: { include: { navLinks: { select: { navNodeId: true } } } },
        assets: true,
        navNodes: { include: { edgesFrom: true } },
      },
    });
    if (!floor) throw new NotFoundException(`Floor ${id} not found`);
    return floor;
  }

  create(dto: CreateFloorDto) {
    return this.prisma.floor.create({ data: dto });
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
