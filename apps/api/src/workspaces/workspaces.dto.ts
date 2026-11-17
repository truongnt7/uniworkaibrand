import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../common/transforms';
import { WORKSPACE_ROLES, WorkspaceRole } from '../database/entities';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'UNICOM Workspace' }) @Trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
}

export class UpdateWorkspaceDto extends CreateWorkspaceDto {}

export class AddMemberDto {
  @ApiProperty({ description: 'Email của tài khoản đã đăng ký' }) @Trim() @IsEmail() email: string;
  @ApiProperty({ enum: WORKSPACE_ROLES, default: 'member' }) @IsIn(WORKSPACE_ROLES as unknown as string[]) role: WorkspaceRole = 'member';
}

export class UpdateMemberDto {
  @ApiProperty({ enum: WORKSPACE_ROLES }) @IsIn(WORKSPACE_ROLES as unknown as string[]) role: WorkspaceRole;
}
