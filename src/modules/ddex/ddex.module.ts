import { Module } from '@nestjs/common';
import { DdexController } from './ddex.controller';
import { DDEXService } from './ddex.service';

@Module({
	controllers: [DdexController],
	providers: [DDEXService],
	exports: [DDEXService],
})
export class DDEXModule {}
