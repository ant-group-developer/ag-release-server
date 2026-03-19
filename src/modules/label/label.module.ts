import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { Label } from './entities/label.entity';
import { LabelController } from './label.controller';
import { LabelQueryService } from './services/label.query.service';
import { LabelService } from './services/label.service';

@Module({
	imports: [TypeOrmModule.forFeature([Label]), BucketModule2],
	controllers: [LabelController],
	providers: [LabelService, LabelQueryService],
})
export class LabelModule {}
