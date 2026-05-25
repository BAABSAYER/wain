import { IsString, IsNumber, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class CreateNodeDto {
  @IsString() floorId!: string;
  @Type(() => Number) @IsNumber() x!: number;
  @Type(() => Number) @IsNumber() y!: number;
  @Type(() => Number) @IsNumber() @IsOptional() z?: number;
  @IsString() @IsOptional() type?: string;
  @IsString() @IsOptional() connectedFloorNodeId?: string;
}
