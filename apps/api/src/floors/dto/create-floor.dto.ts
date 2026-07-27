import { IsIn, IsString, IsNumber, IsOptional, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateFloorDto {
  @ApiProperty() @IsString() buildingId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() nameAr!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() level!: number;
  @ApiProperty({ required: false }) @Type(() => Number) @IsNumber() @IsOptional() width?: number;
  @ApiProperty({ required: false }) @Type(() => Number) @IsNumber() @IsOptional() height?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() floorPlanUrl?: string;
  @ApiProperty({ required: false, minimum: -90, maximum: 90 }) @Type(() => Number) @IsNumber() @Min(-90) @Max(90) @IsOptional() geoLatitude?: number;
  @ApiProperty({ required: false, minimum: -180, maximum: 180 }) @Type(() => Number) @IsNumber() @Min(-180) @Max(180) @IsOptional() geoLongitude?: number;
  @ApiProperty({ required: false, minimum: 0, maximum: 360 }) @Type(() => Number) @IsNumber() @Min(0) @Max(360) @IsOptional() geoBearing?: number;
  @ApiProperty({ required: false, minimum: 0.001 }) @Type(() => Number) @IsNumber() @Min(0.001) @IsOptional() geoMetersPerUnit?: number;
  @ApiProperty({ required: false, enum: ["satellite", "streets"] }) @IsIn(["satellite", "streets"]) @IsOptional() geoBasemap?: string;
}
