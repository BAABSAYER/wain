import { IsString, IsNumber, IsOptional } from "class-validator";
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
}
