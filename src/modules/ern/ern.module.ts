import { Module } from '@nestjs/common';
import { ErnController } from './ern.controller';
import { ErnService } from './ern.service';

@Module({
	controllers: [ErnController],
	providers: [ErnService],
	exports: [ErnService],
})
export class ErnModule {}
