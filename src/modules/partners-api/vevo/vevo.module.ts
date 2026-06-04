import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { VevoService } from './services/vevo.service';

@Module({
	imports: [HttpModule, AppConfigModule],
	providers: [VevoService],
	exports: [VevoService],
})
export class VevoModule {}
