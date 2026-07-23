import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateOutdoorFeatureDto {
  @ApiProperty() @IsString() floorId!: string;
  @ApiProperty() @IsString() type!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() label?: string;
  @ApiProperty() @IsArray() points!: Array<{ x: number; y: number }>;
  @ApiProperty({ required: false }) @IsNumber() @Min(1) @IsOptional() width?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() color?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() lineColor?: string;
  @ApiProperty({ required: false }) @IsInt() @Min(1) @IsOptional() laneCount?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() parkingAngle?: number;
  @ApiProperty({ required: false }) @IsNumber() @Min(4) @IsOptional() stallWidth?: number;
  @ApiProperty({ required: false }) @IsNumber() @Min(4) @IsOptional() stallDepth?: number;
}
