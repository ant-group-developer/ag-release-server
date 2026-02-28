import { Module } from '@nestjs/common';
import { DdexController } from './ddex.controller';
import { DDEXService } from './ddex.service';

@Module({
	// imports: [IsrcModule],
	controllers: [DdexController],
	providers: [DDEXService],
	exports: [DDEXService],
})
export class DDEXModule {}
