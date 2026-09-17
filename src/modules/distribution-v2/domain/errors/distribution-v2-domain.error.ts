export class DistributionV2DomainError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'INVALID_TRANSITION'
			| 'INVARIANT_VIOLATION'
			| 'RETRY_LIMIT_EXCEEDED',
	) {
		super(message);
		this.name = 'DistributionV2DomainError';
	}
}

export function invalidTransition(
	entity: string,
	current: string,
	command: string,
): DistributionV2DomainError {
	return new DistributionV2DomainError(
		`${entity} cannot apply ${command} from state ${current}`,
		'INVALID_TRANSITION',
	);
}

export function invariantViolation(
	entity: string,
	message: string,
): DistributionV2DomainError {
	return new DistributionV2DomainError(
		`${entity}: ${message}`,
		'INVARIANT_VIOLATION',
	);
}

export function retryLimitExceeded(
	entity: string,
	retryCount: number,
	maxRetries: number,
): DistributionV2DomainError {
	return new DistributionV2DomainError(
		`${entity} retry limit exceeded (${retryCount}/${maxRetries})`,
		'RETRY_LIMIT_EXCEEDED',
	);
}
