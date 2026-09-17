import { DistributionV2DomainEvent } from '../events/distribution-v2.domain-event';
import { RetryPolicyV2 } from '../value-objects/retry-policy';
import {
	createChannelDeliveryState,
	reduceChannelDelivery,
} from './channel-delivery.reducer';
import {
	ChannelDeliveryCommand,
	ChannelDeliveryState,
	CreateChannelDeliveryInput,
} from './channel-delivery.types';

export class ChannelDelivery {
	private _state: ChannelDeliveryState;
	private readonly retryPolicy: RetryPolicyV2;

	private constructor(
		state: ChannelDeliveryState,
		retryPolicy: RetryPolicyV2,
	) {
		this._state = state;
		this.retryPolicy = retryPolicy;
	}

	static create(
		input: CreateChannelDeliveryInput,
		retryPolicy = new RetryPolicyV2(),
	): ChannelDelivery {
		return new ChannelDelivery(
			createChannelDeliveryState(input),
			retryPolicy,
		);
	}

	static rehydrate(
		state: ChannelDeliveryState,
		retryPolicy = new RetryPolicyV2(),
	): ChannelDelivery {
		return new ChannelDelivery({ ...state }, retryPolicy);
	}

	get state(): ChannelDeliveryState {
		return this._state;
	}

	get id(): string {
		return this._state.id;
	}

	get isTerminal(): boolean {
		return ['LIVE', 'ISSUES', 'TAKEN_DOWN', 'SKIPPED'].includes(
			this._state.status,
		);
	}

	apply(
		command: ChannelDeliveryCommand,
		distributionId: string,
	): DistributionV2DomainEvent[] {
		const previous = this._state;
		const reduction = reduceChannelDelivery(
			previous,
			command,
			this.retryPolicy,
		);
		this._state = reduction.state;

		if (!reduction.event) return [];

		return [
			{
				id: `${distributionId}:${this.id}:${command.commandId}`,
				type: reduction.event.type,
				distributionId,
				channelId: this.id,
				commandId: command.commandId,
				occurredAt: command.occurredAt,
				payload: {
					from: previous.status,
					to: this._state.status,
					...reduction.event.payload,
				},
			},
		];
	}
}
