import { Controller, Get, Post, Patch, Delete, Param, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BuildingsService } from "./buildings.service";
import { CreateBuildingDto } from "./dto/create-building.dto";

@ApiTags("buildings")
@Controller("buildings")
export class BuildingsController {
  constructor(private readonly svc: BuildingsService) {}

  @Get()           findAll()                              { return this.svc.findAll(); }
  @Get(":id")      findOne(@Param("id") id: string)      { return this.svc.findOne(id); }
  @Get("slug/:slug") findBySlug(@Param("slug") slug: string) { return this.svc.findBySlug(slug); }
  @Post()          create(@Body() dto: CreateBuildingDto) { return this.svc.create(dto); }
  @Patch(":id")    update(@Param("id") id: string, @Body() dto: Partial<CreateBuildingDto>) { return this.svc.update(id, dto); }
  @Delete(":id")   remove(@Param("id") id: string)       { return this.svc.remove(id); }
}
