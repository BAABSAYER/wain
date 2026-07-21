import { IsString, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class DuplicateFloorDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() nameAr!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() level!: number;
}
