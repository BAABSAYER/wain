import { Controller, Get, Post, Delete, Param, Body, Query } from "@nestjs/common";
import { ApiTags, ApiQuery } from "@nestjs/swagger";
import { QrService } from "./qr.service";
import { IsString, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

class CreateQrDto {
  @ApiProperty() @IsString() buildingId!: string;
  @ApiProperty() @IsString() floorId!: string;
  @ApiProperty() @IsString() nodeId!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() label?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() appBaseUrl?: string;
}

@ApiTags("qr")
@Controller("qr")
export class QrController {
  constructor(private readonly svc: QrService) {}

  @Post()
  create(@Body() dto: CreateQrDto) {
    return this.svc.create(
      dto.buildingId,
      dto.floorId,
      dto.nodeId,
      dto.label ?? "",
      dto.appBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000",
    );
  }

  @Get("building/:buildingId") findByBuilding(@Param("buildingId") id: string) { return this.svc.findByBuilding(id); }
  @Get("resolve/:code")        resolve(@Param("code") code: string)             { return this.svc.resolve(code); }
  @Delete(":id")               remove(@Param("id") id: string)                  { return this.svc.remove(id); }
}
