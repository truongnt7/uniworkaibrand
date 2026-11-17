import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { NormalizeTags, ToBoolean, Trim } from '../common/transforms';
import { CONTENT_KINDS, CONTENT_STATUSES, ContentKind, ContentStatus } from '../database/entities';

export class CreateContentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId: string;
  @ApiProperty({ enum: CONTENT_KINDS }) @IsIn(CONTENT_KINDS as unknown as string[]) kind: ContentKind;
  @ApiProperty({ example: 'Serum - xoay 360° 9:16' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Id ProjectVersion phía client' }) @IsOptional() @IsUUID() projectVersionId?: string;
  @ApiPropertyOptional({ enum: CONTENT_STATUSES, default: 'rendering' }) @IsOptional() @IsIn(CONTENT_STATUSES as unknown as string[]) status?: ContentStatus;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional({ example: 'mp4' }) @IsOptional() @IsString() @MaxLength(32) format?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) durationMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) width?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) height?: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() folderId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @NormalizeTags() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() favorite?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) deviceId?: string;
}

export class UpdateContentDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ enum: CONTENT_STATUSES }) @IsOptional() @IsIn(CONTENT_STATUSES as unknown as string[]) status?: ContentStatus;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) format?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) durationMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) width?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) height?: number;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = đưa về thư mục gốc' }) @IsOptional() @IsUUID() folderId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @NormalizeTags() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() favorite?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) deviceId?: string;
}

export class ListContentsQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional({ enum: CONTENT_KINDS }) @IsOptional() @IsIn(CONTENT_KINDS as unknown as string[]) kind?: ContentKind;
  @ApiPropertyOptional({ enum: CONTENT_STATUSES }) @IsOptional() @IsIn(CONTENT_STATUSES as unknown as string[]) status?: ContentStatus;
  @ApiPropertyOptional({ description: "UUID thư mục, hoặc 'root' cho nội dung chưa vào thư mục" }) @IsOptional() @IsString() @MaxLength(36) folderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) tag?: string;
  @ApiPropertyOptional() @IsOptional() @ToBoolean() @IsBoolean() favorite?: boolean;
  @ApiPropertyOptional({ description: 'Chỉ lấy phiên bản mới nhất của mỗi nội dung' }) @IsOptional() @ToBoolean() @IsBoolean() latestOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
}

export class CreateFolderDto {
  @ApiProperty() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateFolderDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() parentId?: string | null;
}
