import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { ToBoolean, Trim } from '../common/transforms';
import { MODEL_STATUSES, ModelStatus } from '../database/entities';

const HEX = /^#[0-9a-fA-F]{6}$/;
const dim = () => (target: object, key: string) => {
  IsNumber({ maxDecimalPlaces: 2 })(target, key);
  Min(0.01)(target, key);
  Max(10000)(target, key);
};

export class CreateProductDto {
  @ApiProperty({ example: 'SR-VITC-30', maxLength: 64 })
  @Trim() @IsString() @IsNotEmpty() @MaxLength(64) @Matches(/^[\p{L}\p{N}._\-/ ]+$/u)
  sku: string;

  @ApiProperty({ example: 'Serum Vitamin C 30ml' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: 'Mỹ phẩm' }) @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) category?: string;
  @ApiPropertyOptional({ example: 'UNICOM' }) @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) brand?: string;
  @ApiPropertyOptional({ description: 'mm', example: 60 }) @IsOptional() @dim() widthMm?: number;
  @ApiPropertyOptional({ description: 'mm', example: 60 }) @IsOptional() @dim() depthMm?: number;
  @ApiPropertyOptional({ description: 'mm', example: 146 }) @IsOptional() @dim() heightMm?: number;
  @ApiPropertyOptional({ type: [String], example: ['#C8102E', '#FFFFFF'] })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(HEX, { each: true })
  brandColors?: string[];
  @ApiPropertyOptional({ description: 'Id thiết bị client tạo/sửa bản ghi (phục vụ đồng bộ)' })
  @IsOptional() @IsString() @MaxLength(64) deviceId?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(64) @Matches(/^[\p{L}\p{N}._\-/ ]+$/u) sku?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Trim() @IsString() @MaxLength(120) category?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Trim() @IsString() @MaxLength(120) brand?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @dim() widthMm?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @dim() depthMm?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @dim() heightMm?: number | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(HEX, { each: true }) brandColors?: string[];
  @ApiPropertyOptional({ enum: MODEL_STATUSES, description: "Đặt 'generating' khi bắt đầu tạo model; 'ready' do hệ thống đặt khi có .glb" })
  @IsOptional() @IsIn(['none', 'generating']) modelStatus?: ModelStatus;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() coverAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) deviceId?: string;
}

export class ListProductsQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên/SKU/thương hiệu' }) @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @ApiPropertyOptional({ description: 'true = Có mô hình 3D; false = Chỉ có ảnh' })
  @IsOptional() @ToBoolean() @IsBoolean() hasModel?: boolean;
}
