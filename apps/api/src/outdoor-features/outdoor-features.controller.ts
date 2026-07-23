import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OutdoorFeaturesService } from "./outdoor-features.service";
import { CreateOutdoorFeatureDto } from "./dto/create-outdoor-feature.dto";

@ApiTags("outdoor-features")
@Controller("outdoor-features")
export class OutdoorFeaturesController {
  constructor(private readonly service: OutdoorFeaturesService) {}

  @Get("floor/:floorId")
  findByFloor(@Param("floorId") floorId: string) {
    return this.service.findByFloor(floorId);
  }

  @Put("floor/:floorId/bulk")
  bulkSave(
    @Param("floorId") floorId: string,
    @Body() body: { features: Array<Partial<CreateOutdoorFeatureDto> & { id?: string }> },
  ) {
    return this.service.bulkSave(floorId, body?.features ?? []);
  }
}
