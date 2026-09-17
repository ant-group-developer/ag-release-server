import {
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../../enums/distribution-v2.enum';

export interface DistributionV2Policy {
	readonly type: DistributionV2ExecutionType;
	readonly needsProvisioning: boolean;
	readonly needsPackageBuild: boolean;
	readonly terminalStatus: DistributionV2Status;
}

export type DistributionPolicy = DistributionV2Policy;

export function policyFor(
	type: DistributionV2ExecutionType,
): DistributionV2Policy {
	switch (type) {
		case DistributionV2ExecutionType.INITIAL:
			return {
				type,
				needsProvisioning: true,
				needsPackageBuild: true,
				terminalStatus: DistributionV2Status.DISTRIBUTED,
			};
		case DistributionV2ExecutionType.UPDATE:
			return {
				type,
				needsProvisioning: false,
				needsPackageBuild: true,
				terminalStatus: DistributionV2Status.DISTRIBUTED,
			};
		case DistributionV2ExecutionType.TAKEDOWN:
			return {
				type,
				needsProvisioning: false,
				needsPackageBuild: false,
				terminalStatus: DistributionV2Status.TAKEN_DOWN,
			};
	}
}
