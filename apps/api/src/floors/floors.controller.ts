import { Controller, Get, Post, Patch, Delete, Param, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { FloorsService } from "./floors.service";
import { CreateFloorDto } from "./dto/create-floor.dto";

@ApiTags("floors")
@Controller("floors")
export class FloorsController {
  constructor(private readonly svc: FloorsService) {}

  @Get("building/:buildingId") findByBuilding(@Param("buildingId") id: string) { return this.svc.findByBuilding(id); }
  @Get(":id")                  findOne(@Param("id") id: string)                 { return this.svc.findOne(id); }
  @Post()                      create(@Body() dto: CreateFloorDto)              { return this.svc.create(dto); }
  @Patch(":id")                update(@Param("id") id: string, @Body() dto: Partial<CreateFloorDto>) { return this.svc.update(id, dto); }
  @Delete(":id")               remove(@Param("id") id: string)                 { return this.svc.remove(id); }
}
