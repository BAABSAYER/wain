import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { QrService } from "./qr.service";

// Minimal local Request shape (avoids depending on @types/express). All we
// need is the proxy headers used to auto-detect the public domain.
type Request = { headers: Record<string, string | string[] | undefined> };

class CreateQrDto {
  @ApiProperty() @IsString() buildingId!: string;
  @ApiProperty() @IsString() floorId!: string;
  // nodeId is optional — a QR can be minted unassigned and linked later.
  @ApiProperty({ required: false }) @IsString() @IsOptional() nodeId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() label?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() appBaseUrl?: string;
}

class ReassignQrDto {
  // Pass null to unassign explicitly; omit to leave unchanged.
  @ApiProperty({ required: false, nullable: true }) @IsOptional() nodeId?: string | null;
  @ApiProperty({ required: false }) @IsString() @IsOptional() floorId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() label?: string;
}

/**
 * Resolve the public base URL for QR codes, in this order:
 *   1. caller-supplied override (dto.appBaseUrl)
 *   2. auto-detect from the request's reverse-proxy headers
 *      (X-Forwarded-Proto + X-Forwarded-Host, or Host) — so a QR generated
 *      while the admin is at https://wain.baabsayer.sa ALWAYS encodes that
 *      same domain, no env changes required when the domain changes
 *   3. APP_BASE_URL env (legacy fallback)
 *   4. localhost (dev fallback)
 */
function resolveAppBaseUrl(req: Request, override?: string): string {
  if (override) return override;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
  const host  = (req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim()
             || (req.headers["host"] as string | undefined);
  if (host) return `${proto || "http"}://${host}`;
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

@ApiTags("qr")
@Controller("qr")
export class QrController {
  constructor(private readonly svc: QrService) {}

  @Post()
  create(@Body() dto: CreateQrDto, @Req() req: Request) {
    return this.svc.create(
      dto.buildingId,
      dto.floorId,
      dto.nodeId ?? null,
      dto.label ?? "",
      resolveAppBaseUrl(req, dto.appBaseUrl),
    );
  }

  /**
   * Bulk-rebuild every QR PNG for a building using the CURRENT request's
   * domain (or an explicit `?appBaseUrl=...`). Use this once after moving
   * to a new domain or after upgrading to the stable `/qr/<code>` embed —
   * the QR `code` is unchanged so any sticker already on a wall stays valid;
   * only the PNG inside the admin gets refreshed.
   */
  @Post("regenerate/:buildingId")
  regenerate(
    @Param("buildingId") buildingId: string,
    @Req() req: Request,
    @Body() body?: { appBaseUrl?: string },
  ) {
    return this.svc.regenerateForBuilding(buildingId, resolveAppBaseUrl(req, body?.appBaseUrl));
  }

  /**
   * Reassign a printed QR to a different (or no) nav node. The PNG embedded
   * URL doesn't change — admins reassign here rather than re-printing the
   * sticker after a map redraw or node delete.
   */
  @Patch(":id")
  reassign(@Param("id") id: string, @Body() dto: ReassignQrDto) {
    return this.svc.reassign(id, dto);
  }

  @Get("building/:buildingId") findByBuilding(@Param("buildingId") id: string) { return this.svc.findByBuilding(id); }
  @Get("resolve/:code")        resolve(@Param("code") code: string)             { return this.svc.resolve(code); }
  @Delete(":id")               remove(@Param("id") id: string)                  { return this.svc.remove(id); }
}
