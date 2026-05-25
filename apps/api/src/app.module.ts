import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { CacheModule } from "./cache/cache.module";
import { BuildingsModule } from "./buildings/buildings.module";
import { FloorsModule } from "./floors/floors.module";
import { StoresModule } from "./stores/stores.module";
import { NavModule } from "./nav/nav.module";
import { RoutingModule } from "./routing/routing.module";
import { QrModule } from "./qr/qr.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./auth/auth.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule,
    AuthModule,
    BuildingsModule,
    FloorsModule,
    StoresModule,
    NavModule,
    RoutingModule,
    QrModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
