/**
 * ExecutionTypeEnum — the type of a release execution.
 *
 * IMPORTANT: the string values MUST match v3 100%
 * (`release-executions3/enums/release-execution3.enum.ts` → `ExecutionType`)
 * so migrating v3 → v-next state is a plain string copy, no remap needed.
 *
 * Redefined here (not imported from v3) to keep the domain pure:
 * importing v3 would drag in the whole release module + TypeORM → breaks the no-framework-import invariant.
 */
export enum ExecutionTypeEnum {
	INITIAL_RELEASE = 'INITIAL_RELEASE',
	UPDATE = 'UPDATE',
	TAKEDOWN = 'TAKEDOWN',
	RETRY = 'RETRY',
}
