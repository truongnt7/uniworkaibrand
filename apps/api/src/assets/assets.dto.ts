import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Trim } from '../common/transforms';
import { ASSET_KINDS, AssetKind } from '../database/entities';

export class LabelPlacementDto {
  @ApiProperty({ enum: ['cylindrical', 'planar'], description: 'Kiểu chiếu decal' })
  @IsIn(['cylindrical', 'planar']) projection: 'cylindrical' | 'planar';
  @ApiPropertyOptional({ description: 'Vị trí ngang, 0..1 theo UV' }) @IsOptional() @IsNumber() @Min(0) @Max(1) positionU?: number;
  @ApiPropertyOptional({ description: 'Vị trí dọc, 0..1 theo UV' }) @IsOptional() @IsNumber() @Min(0) @Max(1) positionV?: number;
  @ApiPropertyOptional({ description: 'Độ rộng nhãn (mm)' }) @IsOptional() @IsNumber() @Min(0.1) @Max(10000) widthMm?: number;
  @ApiPropertyOptional({ description: 'Độ cao nhãn (mm)' }) @IsOptional() @IsNumber() @Min(0.1) @Max(10000) heightMm?: number;
}

export class CreateAssetDto {
  @ApiProperty({ enum: ASSET_KINDS }) @IsIn(ASSET_KINDS as unknown as string[]) kind: AssetKind;
  @ApiProperty({ example: 'serum.glb' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(255) filename: string;
  @ApiProperty({ example: 'model/gltf-binary' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(127) contentType: string;
  @ApiProperty({ description: 'Dung lượng byte; được ký vào URL và kiểm lại khi hoàn tất' })
  @Type(() => Number) @IsInt() @Min(1) sizeBytes: number;
  @ApiPropertyOptional({ description: 'sha256 hex do client tính (lưu để khử trùng lặp; server chưa tự kiểm lại nội dung)' })
  @IsOptional() @Matches(/^[0-9a-f]{64}$/) sha256?: string;
  @ApiPropertyOptional({ type: LabelPlacementDto, description: "Chỉ dùng cho kind='label'" })
  @IsOptional() @IsObject() @ValidateNested() @Type(() => LabelPlacementDto) label?: LabelPlacementDto;
}

export class UpdateAssetMetaDto {
  @ApiProperty({ type: LabelPlacementDto }) @IsObject() @ValidateNested() @Type(() => LabelPlacementDto) label: LabelPlacementDto;
}

export class ListAssetsQuery {
  @ApiPropertyOptional({ enum: ASSET_KINDS }) @IsOptional() @IsIn(ASSET_KINDS as unknown as string[]) kind?: AssetKind;
}
