import { Controller, Get, Post, Patch, Put, Delete, Param, Body, Query } from "@nestjs/common";
import { ApiTags, ApiQuery } from "@nestjs/swagger";
import { StoresService } from "./stores.service";
import { CreateStoreDto } from "./dto/create-store.dto";

@ApiTags("stores")
@Controller("stores")
export class StoresController {
  constructor(private readonly svc: StoresService) {}

  @Get("floor/:floorId")  findByFloor(@Param("floorId") id: string) { return this.svc.findByFloor(id); }
  @Get("search")
  @ApiQuery({ name: "buildingId", required: true })
  @ApiQuery({ name: "q", required: true })
  search(@Query("buildingId") bId: string, @Query("q") q: string) { return this.svc.search(bId, q); }
  @Get(":id")             findOne(@Param("id") id: string)          { return this.svc.findOne(id); }
  @Post()                 create(@Body() dto: CreateStoreDto)       { return this.svc.create(dto); }
  @Patch(":id")           update(@Param("id") id: string, @Body() dto: Partial<CreateStoreDto>) { return this.svc.update(id, dto); }
  /** Replace the full set of nav nodes this store is linked to (M:N). */
  @Put(":id/nav-links")
  setNavLinks(@Param("id") id: string, @Body() body: { navNodeIds: string[] }) {
    return this.svc.setNavLinks(id, body?.navNodeIds ?? []);
  }
  @Delete(":id")          remove(@Param("id") id: string)           { return this.svc.remove(id); }
}
