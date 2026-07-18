import { PackageBuilder } from '../../domain/ports/package-builder.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { PackagePath } from '../../domain/value-objects/package-path.vo';

/**
 * InMemoryPackageBuilder — test double cho PackageBuilder.
 * Idempotent theo snapshotId: build lại cùng snapshot trả về path đã build, không tạo path mới.
 */
export class InMemoryPackageBuilder implements PackageBuilder {
	private readonly builtBySnapshot = new Map<string, PackagePath>();

	async build(input: {
		snapshotId: string;
		processCode: string;
		key: IdempotencyKey;
	}): Promise<PackagePath> {
		const existing = this.builtBySnapshot.get(input.snapshotId);
		if (existing) return existing;

		const path = PackagePath.create(
			'test-bucket',
			`${input.snapshotId}/${input.processCode}`,
			`checksum-${input.snapshotId}`,
		);
		this.builtBySnapshot.set(input.snapshotId, path);
		return path;
	}
}
