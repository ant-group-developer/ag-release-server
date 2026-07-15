import { InvariantViolationError } from '../errors/domain-errors';
import { CorrelationId } from '../value-objects/correlation-id.vo';
import { DspCode } from '../value-objects/dsp-code.vo';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { ExecutionType } from '../value-objects/execution-type.vo';
import { IdempotencyKey } from '../value-objects/idempotency-key.vo';
import { Isrc } from '../value-objects/isrc.vo';
import { PackagePath } from '../value-objects/package-path.vo';
import { RetryPolicy } from '../value-objects/retry-policy.vo';
import { ScheduledAt } from '../value-objects/scheduled-at.vo';
import { TenantId } from '../value-objects/tenant-id.vo';
import { TicketReason, TicketRef } from '../value-objects/ticket-ref.vo';
import { Upc } from '../value-objects/upc.vo';

describe('Upc', () => {
	it('accepts 12–14 digits', () => {
		expect(Upc.create('123456789012').value).toBe('123456789012');
		expect(Upc.create('  12345678901234 ').value).toBe('12345678901234');
	});
	it('rejects non-12–14-digit', () => {
		expect(() => Upc.create('abc')).toThrow(InvariantViolationError);
		expect(() => Upc.create('12345')).toThrow(InvariantViolationError);
	});
	it('equals by value', () => {
		expect(
			Upc.create('123456789012').equals(Upc.create('123456789012')),
		).toBe(true);
	});
});

describe('Isrc', () => {
	it('normalizes then accepts valid ISRC', () => {
		expect(Isrc.create('us-rc1-76-07839').value).toBe('USRC17607839');
		expect(Isrc.create(' USRC17607839 ').value).toBe('USRC17607839');
	});
	it('rejects wrong shape (letters in year slot)', () => {
		expect(() => Isrc.create('US123AB12345')).toThrow(
			InvariantViolationError,
		);
	});
	it('equals by normalized value', () => {
		expect(
			Isrc.create('us-rc1-76-07839').equals(Isrc.create('USRC17607839')),
		).toBe(true);
	});
});

describe('PackagePath', () => {
	it('builds uri from bucket + key', () => {
		const p = PackagePath.create(
			'my-bucket',
			'packages/20260713153012123/',
		);
		expect(p.uri).toBe('my-bucket/packages/20260713153012123/');
	});
	it('rejects empty bucket / bad key', () => {
		expect(() => PackagePath.create('  ', 'k')).toThrow(
			InvariantViolationError,
		);
		expect(() => PackagePath.create('b', 'has space')).toThrow(
			InvariantViolationError,
		);
	});
	it('equals includes checksum', () => {
		const a = PackagePath.create('b', 'k', 'sha1');
		const b = PackagePath.create('b', 'k', 'sha1');
		const c = PackagePath.create('b', 'k', 'sha2');
		expect(a.equals(b)).toBe(true);
		expect(a.equals(c)).toBe(false);
	});
});

describe('RetryPolicy', () => {
	it('sftpDefault = 3 attempts exponential', () => {
		const p = RetryPolicy.sftpDefault();
		expect(p.maxAttempts).toBe(3);
		expect(p.strategy).toBe('exponential');
	});
	it('canRetry true while under maxAttempts', () => {
		const p = RetryPolicy.sftpDefault();
		expect(p.canRetry(0)).toBe(true);
		expect(p.canRetry(2)).toBe(true);
		expect(p.canRetry(3)).toBe(false); // already failed 3 times → exhausted
	});
	it('rejects maxAttempts < 1', () => {
		expect(() => RetryPolicy.create(0, 0, 'fixed')).toThrow(
			InvariantViolationError,
		);
	});
});

describe('ExecutionType', () => {
	it('exposes is* helpers', () => {
		expect(
			ExecutionType.of(ExecutionTypeEnum.INITIAL_RELEASE).isInitial,
		).toBe(true);
		expect(ExecutionType.of(ExecutionTypeEnum.TAKEDOWN).isTakedown).toBe(
			true,
		);
		expect(ExecutionType.of(ExecutionTypeEnum.UPDATE).isInitial).toBe(
			false,
		);
	});
});

describe('DspCode', () => {
	it('uppercases + accepts [A-Z0-9_]', () => {
		expect(DspCode.create('spotify').value).toBe('SPOTIFY');
		expect(DspCode.create('CI').value).toBe('CI');
	});
	it('rejects invalid chars', () => {
		expect(() => DspCode.create('spo-tify')).toThrow(
			InvariantViolationError,
		);
	});
});

describe('CorrelationId', () => {
	it('accepts uuid v4', () => {
		const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
		expect(CorrelationId.create(id).value).toBe(id);
	});
	it('rejects non-uuid', () => {
		expect(() => CorrelationId.create('not-a-uuid')).toThrow(
			InvariantViolationError,
		);
	});
});

describe('IdempotencyKey', () => {
	it('accepts non-empty ≤128', () => {
		expect(IdempotencyKey.create('submit:rel-1').value).toBe(
			'submit:rel-1',
		);
	});
	it('rejects empty / >128', () => {
		expect(() => IdempotencyKey.create('   ')).toThrow(
			InvariantViolationError,
		);
		expect(() => IdempotencyKey.create('x'.repeat(129))).toThrow(
			InvariantViolationError,
		);
	});
});

describe('TenantId', () => {
	it('accepts non-empty', () => {
		expect(TenantId.create('tenant-a').value).toBe('tenant-a');
	});
	it('rejects empty', () => {
		expect(() => TenantId.create('')).toThrow(InvariantViolationError);
	});
});

describe('ScheduledAt', () => {
	const now = new Date('2026-07-14T00:00:00Z');
	it('accepts now or future', () => {
		const future = new Date('2026-07-20T00:00:00Z');
		expect(ScheduledAt.create(future, now).epochMs).toBe(future.getTime());
		expect(ScheduledAt.create(now, now).epochMs).toBe(now.getTime());
	});
	it('rejects past', () => {
		const past = new Date('2026-07-01T00:00:00Z');
		expect(() => ScheduledAt.create(past, now)).toThrow(
			InvariantViolationError,
		);
	});
	it('is immutable against source mutation', () => {
		const when = new Date('2026-07-20T00:00:00Z');
		const s = ScheduledAt.create(when, now);
		when.setFullYear(2099);
		expect(s.value.getFullYear()).toBe(2026);
	});
});

describe('TicketRef + TicketReason', () => {
	it('accepts non-empty id', () => {
		expect(TicketRef.create('TCK-1').value).toBe('TCK-1');
	});
	it('rejects empty', () => {
		expect(() => TicketRef.create('')).toThrow(InvariantViolationError);
	});
	it('reason enum has QA_FLAG', () => {
		expect(TicketReason.QA_FLAG).toBe('QA_FLAG');
	});
});
