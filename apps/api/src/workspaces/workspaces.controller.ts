import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppException } from '../common/app-exception';
import { JwtAuthGuard, WorkspaceAdminOnly, WorkspaceMemberGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import type { AuthedRequest, AuthUser } from '../auth/auth.types';
import { WorkspacesService } from './workspaces.service';
import { AddMemberDto, CreateWorkspaceDto, UpdateMemberDto, UpdateWorkspaceDto } from './workspaces.dto';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly svc: WorkspacesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.svc.create(user.id, dto.name);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listMine(user.id);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  get(@Req() req: AuthedRequest) {
    const m = req.membership!;
    return this.svc.get(m.workspaceId, m.role);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  @WorkspaceAdminOnly()
  rename(@Param('workspaceId') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.svc.rename(id, dto.name);
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  members(@Param('workspaceId') id: string) {
    return this.svc.listMembers(id);
  }

  @Post(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  @WorkspaceAdminOnly()
  addMember(@Param('workspaceId') id: string, @Body() dto: AddMemberDto) {
    return this.svc.addMember(id, dto.email, dto.role);
  }

  @Patch(':workspaceId/members/:userId')
  @UseGuards(WorkspaceMemberGuard)
  @WorkspaceAdminOnly()
  changeRole(@Param('workspaceId') id: string, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: UpdateMemberDto) {
    return this.svc.changeRole(id, userId, dto.role);
  }

  @Delete(':workspaceId/members/:userId')
  @HttpCode(204)
  @UseGuards(WorkspaceMemberGuard)
  async removeMember(
    @Param('workspaceId') id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthedRequest,
  ): Promise<void> {
    // Admin xóa được bất kỳ ai; member chỉ tự rời workspace.
    if (userId !== req.user.id && req.membership!.role !== 'admin') {
      throw new AppException('WORKSPACE_ADMIN_REQUIRED', 403);
    }
    await this.svc.removeMember(id, userId);
  }
}
