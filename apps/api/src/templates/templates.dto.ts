import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { Trim } from '../common/transforms';
import { TEMPLATE_KINDS, TemplateKind } from '../database/entities';

const ASPECT = /^\d{1,2}:\d{1,2}$/;

export class CreateTemplateDto {
  @ApiProperty({ enum: TEMPLATE_KINDS }) @IsIn(TEMPLATE_KINDS as unknown as string[]) kind: TemplateKind;
  @ApiProperty({ example: 'Thiên nhiên nhẹ nhàng' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: 'Mỹ phẩm' }) @IsOptional() @Trim() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional({ example: 'Tối giản' }) @IsOptional() @Trim() @IsString() @MaxLength(64) style?: string;
  @ApiProperty({ type: [String], example: ['1:1', '9:16'] }) @IsArray() @ArrayMaxSize(8) @Matches(ASPECT, { each: true }) aspectRatios: string[];
  @ApiProperty({ example: 'nature-soft', description: 'Id preset trong runtime pack' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(120) presetId: string;
  @ApiPropertyOptional({ description: 'Key S3 của file .blend (nếu tải riêng)' }) @IsOptional() @IsString() @MaxLength(512) blendCloudKey?: string;
  @ApiPropertyOptional({ description: 'Collections bật/tắt được: bục, lá, logo…', example: [{ id: 'podium', label: 'Bục', default: true }] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) components?: unknown[];
  @ApiPropertyOptional({ description: 'Tham số tùy chỉnh được (UI đọc)' }) @IsOptional() @IsObject() params?: Record<string, unknown>;
  @ApiPropertyOptional({ example: 'CC0 (Poly Haven)' }) @IsOptional() @Trim() @IsString() @MaxLength(255) license?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(255) source?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) version?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(120) category?: string | null;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(64) style?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(ASPECT, { each: true }) aspectRatios?: string[];
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) presetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) blendCloudKey?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(50) components?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsObject() params?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) license?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) source?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() published?: boolean;
}

export class ListTemplatesQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: TEMPLATE_KINDS }) @IsOptional() @IsIn(TEMPLATE_KINDS as unknown as string[]) kind?: TemplateKind;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional({ example: '9:16' }) @IsOptional() @Matches(ASPECT) aspect?: string;
  @ApiPropertyOptional({ enum: ['system', 'workspace'], description: 'Bỏ trống = cả mẫu hệ thống và mẫu của workspace' })
  @IsOptional() @IsIn(['system', 'workspace']) owner?: 'system' | 'workspace';
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
}
