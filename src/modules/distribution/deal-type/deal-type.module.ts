import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DealTypesController } from './deal-type.controller';
import { DealTypeEntity } from './entities/deal-type.entity';
import { DealTypeQueryService } from './services/deal-type.query.service';
import { DealTypesService } from './services/deal-type.service';

@Module({
	imports: [TypeOrmModule.forFeature([DealTypeEntity])],
	controllers: [DealTypesController],
	providers: [DealTypesService, DealTypeQueryService],
	exports: [DealTypesService],
})
export class DealTypeModule {}
