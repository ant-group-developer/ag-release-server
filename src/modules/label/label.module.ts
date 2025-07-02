import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Label } from './entities/label.entity';
import { LabelController } from './label.controller';
import { LabelQbService } from './services/label.qb.service';
import { LabelService } from './services/label.service';

@Module({
	imports: [TypeOrmModule.forFeature([Label]), BucketModule],
	controllers: [LabelController],
	providers: [LabelService, LabelQbService],
})
export class LabelModule {}
