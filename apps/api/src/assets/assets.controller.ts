import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, WorkspaceMemberGuard } from '../auth/guards';
import { AssetsService } from './assets.service';
import { CreateAssetDto, ListAssetsQuery, UpdateAssetMetaDto } from './assets.dto';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/products/:productId/assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @ApiOperation({ summary: 'Khai báo asset và nhận presigned PUT URL (client tải thẳng lên S3)' })
  create(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Body() dto: CreateAssetDto) {
    return this.svc.create(ws, pid, dto);
  }

  @Get()
  list(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Query() q: ListAssetsQuery) {
    return this.svc.list(ws, pid, q.kind);
  }

  @Get(':assetId')
  get(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.svc.get(ws, pid, id);
  }

  @Post(':assetId/upload-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cấp lại presigned PUT URL cho asset còn pending' })
  refresh(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.svc.refreshUpload(ws, pid, id);
  }

  @Post(':assetId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xác nhận đã tải lên: server kiểm tra object và dung lượng rồi đánh dấu ready' })
  complete(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.svc.complete(ws, pid, id);
  }

  @Get(':assetId/download-url')
  @ApiOperation({ summary: 'Presigned GET URL (ngắn hạn)' })
  download(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string) {
    return this.svc.downloadUrl(ws, pid, id);
  }

  @Patch(':assetId/label')
  @ApiOperation({ summary: 'Cập nhật vị trí/độ rộng/độ cao/kiểu chiếu của nhãn' })
  label(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetMetaDto) {
    return this.svc.updateLabel(ws, pid, id, dto.label);
  }

  @Delete(':assetId')
  @HttpCode(204)
  async remove(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) pid: string, @Param('assetId', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.remove(ws, pid, id);
  }
}
