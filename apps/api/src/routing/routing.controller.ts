import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiQuery } from "@nestjs/swagger";
import { RoutingService } from "./routing.service";

@ApiTags("routing")
@Controller("route")
export class RoutingController {
  constructor(private readonly svc: RoutingService) {}

  @Get()
  @ApiQuery({ name: "from", description: "Start NavNode ID" })
  @ApiQuery({ name: "to", description: "Destination Store ID" })
  @ApiQuery({ name: "accessible", required: false, type: Boolean })
  getRoute(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("accessible") accessible?: string,
  ) {
    return this.svc.getRoute(from, to, accessible === "true");
  }
}
