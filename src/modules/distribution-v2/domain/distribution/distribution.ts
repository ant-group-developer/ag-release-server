import { DistributionV2DomainEvent } from '../events/distribution-v2.domain-event';
import { RetryPolicyV2 } from '../value-objects/retry-policy';
import {
	createDistributionState,
	reduceDistribution,
} from './distribution.reducer';
import {
	CreateDistributionInput,
	DistributionCommand,
	DistributionState,
} from './distribution.types';

export class Distribution {
	private _state: DistributionState;
	private readonly retryPolicy: RetryPolicyV2;

	private constructor(state: DistributionState, retryPolicy: RetryPolicyV2) {
		this._state = state;
		this.retryPolicy = retryPolicy;
	}

	static create(
		input: CreateDistributionInput,
		retryPolicy = new RetryPolicyV2(),
	): Distribution {
		return new Distribution(createDistributionState(input), retryPolicy);
	}

	static rehydrate(
		state: DistributionState,
		retryPolicy = new RetryPolicyV2(),
	): Distribution {
		return new Distribution(
			{ ...state, channels: [...state.channels] },
			retryPolicy,
		);
	}

	get state(): DistributionState {
		return this._state;
	}

	get id(): string {
		return this._state.id;
	}

	get status(): DistributionState['status'] {
		return this._state.status;
	}

	get channels(): readonly DistributionState['channels'][number][] {
		return this._state.channels;
	}

	apply(command: DistributionCommand): DistributionV2DomainEvent[] {
		const reduction = reduceDistribution(
			this._state,
			command,
			this.retryPolicy,
		);
		this._state = reduction.state;
		return [...reduction.events];
	}
}
