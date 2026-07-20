import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString } from "class-validator";

export class CreateAssetDto {
  @ApiProperty() @IsString() floorId!: string;
  @ApiProperty() @IsString() type!: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() label?: string;
  @ApiProperty() @IsNumber() x!: number;
  @ApiProperty() @IsNumber() y!: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() z?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() rotation?: number;
  @ApiProperty({ required: false }) @IsNumber() @IsOptional() scale?: number;
  @ApiProperty({ required: false }) @IsString() @IsOptional() color?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() modelUrl?: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() navNodeId?: string | null;
}
