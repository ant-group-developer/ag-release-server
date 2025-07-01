import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BucketModule } from '../bucket/bucket.module';
import { Label } from './entities/label.entity';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';

@Module({
	imports: [TypeOrmModule.forFeature([Label]), BucketModule],
	controllers: [LabelController],
	providers: [LabelService],
})
export class LabelModule {}
