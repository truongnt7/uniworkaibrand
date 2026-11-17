import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, WorkspaceMemberGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, ListTemplatesQuery, UpdateTemplateDto } from './templates.dto';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list(@Param('workspaceId') ws: string, @Query() q: ListTemplatesQuery) {
    return this.svc.list(ws, q);
  }

  @Get(':templateId')
  get(@Param('workspaceId') ws: string, @Param('templateId', ParseUUIDPipe) id: string) {
    return this.svc.get(ws, id);
  }

  @Post()
  create(@Param('workspaceId') ws: string, @CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.svc.createForWorkspace(ws, user.id, dto);
  }

  @Patch(':templateId')
  update(@Param('workspaceId') ws: string, @Param('templateId', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.svc.updateForWorkspace(ws, id, dto);
  }

  @Delete(':templateId')
  @HttpCode(204)
  async remove(@Param('workspaceId') ws: string, @Param('templateId', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.removeForWorkspace(ws, id);
  }
}
