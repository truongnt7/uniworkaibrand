import { Module } from '@nestjs/common';
import { AssetsController } from '../assets/assets.controller';
import { AssetsService } from '../assets/assets.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({ controllers: [AssetsController, ProductsController], providers: [AssetsService, ProductsService] })
export class CatalogModule {}
