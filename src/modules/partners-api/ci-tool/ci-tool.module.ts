import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CiToolController } from './ci-tool.controller';
import { CiToolService } from './ci-tool.service';
@Module({
	imports: [HttpModule],
	controllers: [CiToolController],
	providers: [CiToolService],
	exports: [CiToolService],
})
export class CiToolModule {}
