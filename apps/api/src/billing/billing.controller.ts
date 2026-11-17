import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, WorkspaceMemberGuard } from '../auth/guards';
import { PageQueryDto } from '../common/pagination';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/billing')
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Gói đang dùng và số dư credit (app đọc để hiển thị/kiểm tra giấy phép)' })
  summary(@Param('workspaceId') ws: string) {
    return this.svc.summary(ws);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Lịch sử sổ cái credit (mới nhất trước)' })
  ledger(@Param('workspaceId') ws: string, @Query() q: PageQueryDto) {
    return this.svc.ledger(ws, q);
  }
}
