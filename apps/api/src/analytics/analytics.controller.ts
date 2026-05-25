import { Controller, Post, Get, Param, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { TrackEventDto } from "./dto/track-event.dto";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Post("track")     track(@Body() dto: TrackEventDto)               { return this.svc.track(dto); }
  @Get(":buildingId") summary(@Param("buildingId") id: string)        { return this.svc.getSummary(id); }
}
