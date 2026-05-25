import { IsString, IsNumber, IsBoolean, IsArray, IsOptional, ValidateNested } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

class Point2DDto {
  @IsNumber() x!: number;
  @IsNumber() y!: number;
}

export class CreateStoreDto {
  @ApiProperty() @IsString() floorId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() nameAr!: string;
  @ApiProperty() @IsString() category!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() zone?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() zoneAr?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() logoUrl?: string;
  @ApiProperty({ type: [Point2DDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => Point2DDto) polygon!: Point2DDto[];
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() extrudeHeight?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() color?: string;
  @ApiProperty({ required: false }) @IsBoolean() @IsOptional() isSearchable?: boolean;
  @ApiProperty({ required: false }) @IsString() @IsOptional() navNodeId?: string;
}
