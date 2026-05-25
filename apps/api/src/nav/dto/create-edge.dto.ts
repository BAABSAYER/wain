import { IsString, IsNumber, IsBoolean, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class CreateEdgeDto {
  @IsString() fromNodeId!: string;
  @IsString() toNodeId!: string;
  @Type(() => Number) @IsNumber() @IsOptional() distance?: number;
  @Type(() => Number) @IsNumber() @IsOptional() fromX?: number;
  @Type(() => Number) @IsNumber() @IsOptional() fromY?: number;
  @Type(() => Number) @IsNumber() @IsOptional() toX?: number;
  @Type(() => Number) @IsNumber() @IsOptional() toY?: number;
  @IsBoolean() @IsOptional() isAccessible?: boolean;
}
