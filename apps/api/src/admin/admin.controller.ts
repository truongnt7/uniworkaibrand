import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard, PlatformAdminGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { Actor, BillingService } from '../billing/billing.service';
import {
  AdjustCreditsDto, CancelInvoiceDto, ConfirmInvoiceDto, CreateInvoiceDto, CreatePlanDto, GrantSubscriptionDto,
  ListAuditQuery, ListInvoicesQuery, ListWorkspacesAdminQuery, UpdatePlanDto,
} from '../billing/billing.dto';
import { PageQueryDto } from '../common/pagination';
import { TemplatesService } from '../templates/templates.service';
import { CreateTemplateDto, UpdateTemplateDto } from '../templates/templates.dto';
import { RuntimeService } from '../runtime/runtime.service';
import { PublishRuntimeDto } from '../runtime/runtime.dto';

const actorOf = (user: AuthUser, req: Request): Actor => ({ userId: user.id, ip: req.ip });

/** Khu admin nền tảng (nhân sự của ta): cấp gói/credit thủ công sau chuyển khoản, mẫu hệ thống, phát hành runtime. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly runtime: RuntimeService,
  ) {}

  @Get('workspaces')
  workspaces(@Query() q: ListWorkspacesAdminQuery) {
    return this.billing.listWorkspaces(q);
  }

  @Get('workspaces/:workspaceId/billing')
  summary(@Param('workspaceId', ParseUUIDPipe) id: string) {
    return this.billing.summary(id);
  }

  @Get('workspaces/:workspaceId/ledger')
  ledger(@Param('workspaceId', ParseUUIDPipe) id: string, @Query() q: PageQueryDto) {
    return this.billing.ledger(id, q);
  }

  @Post('workspaces/:workspaceId/credits')
  @ApiOperation({ summary: 'Cộng/trừ credit thủ công (bắt buộc lý do, ghi sổ cái + audit)' })
  adjust(@Param('workspaceId', ParseUUIDPipe) id: string, @Body() dto: AdjustCreditsDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.adjustCredits(actorOf(user, req), id, { amount: dto.amount, reason: dto.reason, kind: dto.kind ?? 'grant' });
  }

  @Post('workspaces/:workspaceId/subscriptions')
  @ApiOperation({ summary: 'Cấp gói thủ công cho workspace (không cần hóa đơn)' })
  grant(@Param('workspaceId', ParseUUIDPipe) id: string, @Body() dto: GrantSubscriptionDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.grantSubscription(actorOf(user, req), id, { planId: dto.planId, reason: dto.reason, grantPlanCredits: dto.grantPlanCredits ?? true, endsAt: dto.endsAt });
  }

  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.createPlan(actorOf(user, req), dto);
  }

  @Patch('plans/:planId')
  updatePlan(@Param('planId', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.updatePlan(actorOf(user, req), id, dto);
  }

  @Get('invoices')
  invoices(@Query() q: ListInvoicesQuery) {
    return this.billing.listInvoices(q);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Tạo hóa đơn chuyển khoản (trạng thái pending)' })
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.createInvoice(actorOf(user, req), dto);
  }

  @Post('invoices/:invoiceId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xác nhận đã nhận tiền: kích hoạt gói và cộng credit (đúng một lần)' })
  confirm(@Param('invoiceId', ParseUUIDPipe) id: string, @Body() dto: ConfirmInvoiceDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.confirmInvoice(actorOf(user, req), id, dto);
  }

  @Post('invoices/:invoiceId/cancel')
  @HttpCode(200)
  cancel(@Param('invoiceId', ParseUUIDPipe) id: string, @Body() dto: CancelInvoiceDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.billing.cancelInvoice(actorOf(user, req), id, dto.reason);
  }

  @Get('audit-logs')
  audit(@Query() q: ListAuditQuery) {
    return this.billing.auditLogs(q);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Tạo mẫu hệ thống (owner=system, mọi workspace đều thấy)' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.createSystem(user.id, dto);
  }

  @Patch('templates/:templateId')
  updateTemplate(@Param('templateId', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.updateSystem(id, dto);
  }

  @Delete('templates/:templateId')
  @HttpCode(204)
  async removeTemplate(@Param('templateId', ParseUUIDPipe) id: string): Promise<void> {
    await this.templates.removeSystem(id);
  }

  @Get('runtime/releases')
  releases() {
    return this.runtime.listReleases();
  }

  @Put('runtime/releases')
  @ApiOperation({ summary: 'Phát hành manifest runtime mới (kiểm schema: Blender 4.5 LTS, ffmpeg LGPL, sha256)' })
  publish(@Body() dto: PublishRuntimeDto, @CurrentUser() user: AuthUser) {
    return this.runtime.publish(dto.manifest, dto.note, dto.activate ?? false, user.id);
  }

  @Post('runtime/releases/:releaseId/activate')
  @HttpCode(204)
  async activate(@Param('releaseId', ParseUUIDPipe) id: string): Promise<void> {
    await this.runtime.activate(id);
  }
}
