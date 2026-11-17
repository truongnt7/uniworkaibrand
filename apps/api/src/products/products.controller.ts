import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, WorkspaceMemberGuard } from '../auth/guards';
import { ProductsService } from './products.service';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from './products.dto';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Post()
  create(@Param('workspaceId') ws: string, @Body() dto: CreateProductDto) {
    return this.svc.create(ws, dto);
  }

  @Get()
  list(@Param('workspaceId') ws: string, @Query() q: ListProductsQuery) {
    return this.svc.list(ws, q);
  }

  @Get(':productId')
  get(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) id: string) {
    return this.svc.get(ws, id);
  }

  @Patch(':productId')
  update(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.svc.update(ws, id, dto);
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(@Param('workspaceId') ws: string, @Param('productId', ParseUUIDPipe) id: string): Promise<void> {
    await this.svc.remove(ws, id);
  }
}
