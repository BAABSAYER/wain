import { Module } from "@nestjs/common";
import { RoutingController } from "./routing.controller";
import { RoutingService } from "./routing.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [RoutingController],
  providers: [RoutingService, PrismaService],
})
export class RoutingModule {}
