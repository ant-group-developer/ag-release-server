import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from 'src/common/enums/common';
import { DspRoutingConfigsService } from './dsp-routing-config.service';

@Injectable()
export class DspRoutingConsumer {
	constructor(
		private readonly dspRoutingConfigsService: DspRoutingConfigsService,
	) {}

	@OnEvent(AppEvent.AGGREGATOR_DEFAULT_CHANGED)
	async handleAggregatorDefaultChanged() {
		await this.dspRoutingConfigsService.handleAggregatorDefaultChanged();
	}
}
