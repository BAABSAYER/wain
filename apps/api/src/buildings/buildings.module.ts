import { Module } from "@nestjs/common";
import { BuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [BuildingsController],
  providers: [BuildingsService, PrismaService],
  exports: [BuildingsService],
})
export class BuildingsModule {}
