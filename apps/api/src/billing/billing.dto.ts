import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { Trim } from '../common/transforms';
import { INVOICE_STATUSES } from '../database/entities';

export class CreatePlanDto {
  @ApiProperty({ example: 'pilot-basic' }) @Trim() @Matches(/^[a-z0-9][a-z0-9_-]{1,63}$/) code: string;
  @ApiProperty({ example: 'Pilot Cơ bản' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ example: 990000, description: 'VND' }) @IsInt() @Min(0) priceVnd: number;
  @ApiProperty({ example: 500 }) @IsInt() @Min(0) @Max(100_000_000) creditsIncluded: number;
  @ApiPropertyOptional({ example: 30 }) @IsOptional() @IsInt() @Min(1) @Max(3650) durationDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) seatLimit?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) priceVnd?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000_000) creditsIncluded?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(3650) durationDays?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) seatLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() workspaceId: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() planId?: string;
  @ApiProperty({ example: 990000 }) @IsInt() @Min(0) amountVnd: number;
  @ApiProperty({ example: 'APS-UNICOM-1117', description: 'Nội dung chuyển khoản để đối soát (duy nhất)' })
  @Trim() @Matches(/^[A-Za-z0-9._-]{4,64}$/) reference: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ConfirmInvoiceDto {
  @ApiPropertyOptional({ description: 'Ghi chú đối soát (số tham chiếu ngân hàng...)' }) @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CancelInvoiceDto {
  @ApiProperty() @Trim() @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}

export class AdjustCreditsDto {
  @ApiProperty({ description: 'Số credit cộng (dương) hoặc trừ (âm); khác 0', example: 100 }) @IsInt() @Min(-100_000_000) @Max(100_000_000) amount: number;
  @ApiProperty({ description: 'Lý do (bắt buộc, lưu audit)' }) @Trim() @IsString() @MinLength(3) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ enum: ['grant', 'adjustment', 'refund'], default: 'grant' }) @IsOptional() @IsIn(['grant', 'adjustment', 'refund']) kind?: 'grant' | 'adjustment' | 'refund';
}

export class GrantSubscriptionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() planId: string;
  @ApiProperty() @Trim() @IsString() @MinLength(3) @MaxLength(1000) reason: string;
  @ApiPropertyOptional({ default: true, description: 'Cộng luôn credit của gói vào sổ cái' }) @IsOptional() @IsBoolean() grantPlanCredits?: boolean;
  @ApiPropertyOptional({ description: 'Ghi đè ngày hết hạn (ISO 8601)' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
}

export class ListInvoicesQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional({ enum: INVOICE_STATUSES }) @IsOptional() @IsIn(INVOICE_STATUSES as unknown as string[]) status?: string;
}

export class ListAuditQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) entityType?: string;
}

export class ListWorkspacesAdminQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
}
