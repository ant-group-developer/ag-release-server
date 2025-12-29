import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrmModule } from '../orm/orm.module';
import { Release } from '../release/entities/release.entity';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
	imports: [TypeOrmModule.forFeature([Release]), OrmModule],
	controllers: [DeliveryController],
	providers: [DeliveryService],
})
export class DeliveryModule {}
