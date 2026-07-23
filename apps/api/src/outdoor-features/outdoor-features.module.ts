import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { OutdoorFeaturesController } from "./outdoor-features.controller";
import { OutdoorFeaturesService } from "./outdoor-features.service";

@Module({
  controllers: [OutdoorFeaturesController],
  providers: [OutdoorFeaturesService, PrismaService],
})
export class OutdoorFeaturesModule {}
