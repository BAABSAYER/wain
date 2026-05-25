import { IsString, IsOptional, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Validated payload for the public POST /analytics/track endpoint. Length caps
 * bound abuse, and the global ValidationPipe (whitelist: true) strips any extra
 * fields so only these reach the database.
 */
export class TrackEventDto {
  @ApiProperty() @IsString() @MaxLength(64) buildingId!: string;
  @ApiProperty() @IsString() @MaxLength(64) eventType!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(64) floorId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(128) qrCode?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(64) destinationId?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() @MaxLength(128) sessionId?: string;
}
