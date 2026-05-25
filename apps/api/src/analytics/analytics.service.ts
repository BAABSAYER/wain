import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { TrackEventDto } from "./dto/track-event.dto";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  track(event: TrackEventDto) {
    return this.prisma.analyticsEvent.create({ data: event });
  }

  async getSummary(buildingId: string) {
    const [totalScans, topDestinations, recentEvents] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: { buildingId, eventType: "qr_scan" },
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ["destinationId"],
        where: { buildingId, eventType: "route_requested", destinationId: { not: null } },
        _count: { destinationId: true },
        orderBy: { _count: { destinationId: "desc" } },
        take: 10,
      }),
      this.prisma.analyticsEvent.findMany({
        where: { buildingId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return { totalScans, topDestinations, recentEvents };
  }
}
