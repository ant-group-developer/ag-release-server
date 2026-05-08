// request-tracking/request-tracking.module.ts

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLog } from './entities/request-tracking.entity';
import { RequestTrackingController } from './request-tracking.controller';
import { RequestTrackingInterceptor } from './request-tracking.interceptor';
import { RequestTrackingService } from './request-tracking.service';

@Module({
	imports: [TypeOrmModule.forFeature([RequestLog])],
	controllers: [RequestTrackingController],
	providers: [
		RequestTrackingService,
		{
			provide: APP_INTERCEPTOR,
			useClass: RequestTrackingInterceptor,
		},
	],
	exports: [RequestTrackingService],
})
export class RequestTrackingModule {}
