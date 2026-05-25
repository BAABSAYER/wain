import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateBuildingDto } from "./dto/create-building.dto";

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.building.findMany({
      include: { floors: { orderBy: { level: "asc" } } },
    });
  }

  async findOne(id: string) {
    const building = await this.prisma.building.findUnique({
      where: { id },
      include: {
        floors: {
          orderBy: { level: "asc" },
          include: { stores: true, navNodes: true },
        },
      },
    });
    if (!building) throw new NotFoundException(`Building ${id} not found`);
    return building;
  }

  async findBySlug(slug: string) {
    const building = await this.prisma.building.findUnique({
      where: { slug },
      include: {
        floors: {
          orderBy: { level: "asc" },
          include: { stores: true, navNodes: { include: { edgesFrom: true } } },
        },
      },
    });
    if (!building) throw new NotFoundException(`Building "${slug}" not found`);
    return building;
  }

  create(dto: CreateBuildingDto) {
    return this.prisma.building.create({ data: dto });
  }

  async update(id: string, dto: Partial<CreateBuildingDto>) {
    await this.findOne(id);
    return this.prisma.building.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.building.delete({ where: { id } });
  }
}
