import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

/**
 * Global guard: allows all read traffic + visitor endpoints without auth, and
 * requires a valid admin bearer token for everything that mutates data.
 *
 * Public (no token):
 *   - any GET                       (buildings/floors/stores/route/qr/analytics summary)
 *   - POST /auth/login              (logging in)
 *   - POST /analytics/track         (visitor analytics)
 * Everything else (POST/PATCH/PUT/DELETE) → admin token required.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const path: string = (req.path || req.url || "").split("?")[0];

    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
    if (path.startsWith("/api/auth") || path.startsWith("/auth")) return true;
    if (path.endsWith("/analytics/track")) return true;

    const header: string = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!this.auth.verify(token)) {
      throw new UnauthorizedException("Admin authentication required");
    }
    return true;
  }
}
