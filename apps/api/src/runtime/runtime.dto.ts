import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishRuntimeDto {
  @ApiProperty({ description: 'Manifest: { schemaVersion: 1, blender: {version 4.5.x, channel LTS, artifacts}, ffmpeg: {version, license LGPL-*, artifacts} }' })
  @IsObject() manifest: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional({ default: false, description: 'Đặt làm bản đang phục vụ ngay' }) @IsOptional() @IsBoolean() activate?: boolean;
}
