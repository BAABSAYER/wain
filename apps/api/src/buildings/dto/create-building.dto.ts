import { IsString, IsOptional, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class CreateBuildingDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() nameAr!: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() address?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() logoUrl?: string;
  @ApiProperty({ required: false }) @Type(() => Number) @IsNumber() @IsOptional() northOffset?: number;
}
