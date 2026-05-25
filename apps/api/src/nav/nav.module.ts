import { Module } from "@nestjs/common";
import { NavController } from "./nav.controller";
import { NavService } from "./nav.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [NavController],
  providers: [NavService, PrismaService],
  exports: [NavService],
})
export class NavModule {}
