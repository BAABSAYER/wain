import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto/create-asset.dto";

@ApiTags("assets")
@Controller("assets")
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Get("floor/:floorId") findByFloor(@Param("floorId") floorId: string) {
    return this.svc.findByFloor(floorId);
  }

  @Get(":id") findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  @Post() create(@Body() dto: CreateAssetDto) {
    return this.svc.create(dto);
  }

  @Patch(":id") update(@Param("id") id: string, @Body() dto: Partial<CreateAssetDto>) {
    return this.svc.update(id, dto);
  }

  @Put("floor/:floorId/bulk") bulkSaveFloor(
    @Param("floorId") floorId: string,
    @Body() body: { assets: Array<Partial<CreateAssetDto> & { id?: string }> },
  ) {
    return this.svc.bulkSaveFloor(floorId, body?.assets ?? []);
  }

  @Delete(":id") remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
