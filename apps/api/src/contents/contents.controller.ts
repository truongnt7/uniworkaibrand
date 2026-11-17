import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, WorkspaceMemberGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ContentsService } from './contents.service';
import { CreateContentDto, CreateFolderDto, ListContentsQuery, UpdateContentDto, UpdateFolderDto } from './contents.dto';

@ApiTags('library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId')
export class ContentsController {
  constructor(private readonly svc: ContentsService) {}

  @Post('contents')
  create(@Param('workspaceId') ws: string, @CurrentUser() user: AuthUser, @Body() dto: CreateContentDto) {
    return this.svc.create(ws, user.id, dto);
  }

  @Get('contents')
  list(@Param('workspaceId') ws: string, @Query() q: ListContentsQuery) {
    return this.svc.list(ws, q);
  }

  @Get('contents/:contentId')
  get(@Param('workspaceId') ws: string, @Param('contentId', ParseUUIDPipe) id: string) {
    return this.svc.get(ws, id);
  }

  @Patch('contents/:contentId')
  update(@Param('workspaceId') ws: string, @Param('contentId', ParseUUIDPipe) id: string, @Body() dto: UpdateContentDto) {
    return this.svc.update(ws, id, dto);
  }

  @Post('contents/:contentId/versions')
  createVersion(@Param('workspaceId') ws: string, @CurrentUser() user: AuthUser, @Param('contentId', ParseUUIDPipe) id: string) {
    return this.svc.createVersion(ws, user.id, id);
  }

  @Delete('contents/:contentId')
  @HttpCode(204)
  async remove(@Param('workspaceId') ws: string, @Param('contentId', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.remove(ws, id);
  }

  @Get('tags')
  tags(@Param('workspaceId') ws: string) {
    return this.svc.tags(ws);
  }

  @Get('folders')
  folders(@Param('workspaceId') ws: string) {
    return this.svc.listFolders(ws);
  }

  @Post('folders')
  createFolder(@Param('workspaceId') ws: string, @Body() dto: CreateFolderDto) {
    return this.svc.createFolder(ws, dto);
  }

  @Patch('folders/:folderId')
  updateFolder(@Param('workspaceId') ws: string, @Param('folderId', ParseUUIDPipe) id: string, @Body() dto: UpdateFolderDto) {
    return this.svc.updateFolder(ws, id, dto);
  }

  @Delete('folders/:folderId')
  @HttpCode(204)
  async removeFolder(@Param('workspaceId') ws: string, @Param('folderId', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.removeFolder(ws, id);
  }
}
