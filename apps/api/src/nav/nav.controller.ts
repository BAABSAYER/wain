import { Controller, Get, Post, Patch, Delete, Param, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { NavService } from "./nav.service";
import { CreateNodeDto } from "./dto/create-node.dto";
import { CreateEdgeDto } from "./dto/create-edge.dto";

@ApiTags("nav")
@Controller("nav")
export class NavController {
  constructor(private readonly svc: NavService) {}

  @Get("graph/:buildingId")  getGraph(@Param("buildingId") id: string) { return this.svc.getGraphForBuilding(id); }
  @Post("nodes")             createNode(@Body() dto: CreateNodeDto)    { return this.svc.createNode(dto); }
  @Patch("nodes/:id")        updateNode(@Param("id") id: string, @Body() dto: Partial<CreateNodeDto>) { return this.svc.updateNode(id, dto); }
  @Delete("nodes/:id")       deleteNode(@Param("id") id: string)       { return this.svc.deleteNode(id); }
  @Post("edges")             createEdge(@Body() dto: CreateEdgeDto)    { return this.svc.createEdge(dto); }
  @Delete("edges/:id")       deleteEdge(@Param("id") id: string)       { return this.svc.deleteEdge(id); }

  @Post("graph/:floorId/bulk")
  bulkSave(
    @Param("floorId") floorId: string,
    @Body() body: { nodes: any[]; edges: any[] },
  ) {
    return this.svc.bulkSaveGraph(floorId, body.nodes, body.edges);
  }
}
