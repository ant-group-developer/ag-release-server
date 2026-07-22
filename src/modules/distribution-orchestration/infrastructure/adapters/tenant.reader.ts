import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Tenant } from '../../../tenant/tenant.entity';
import { TenantReader } from '../../application/ports/tenant-reader.port';

/**
 * TenantReaderAdapter — đọc cờ `requiresManualReview` từ bảng tenants qua TypeORM.
 * Isolate application khỏi ORM. Tenant không tồn tại → false (không chặn luồng).
 */
@Injectable()
export class TenantReaderAdapter implements TenantReader {
	constructor(
		@InjectRepository(Tenant)
		private readonly repo: Repository<Tenant>,
	) {}

	async requiresManualReview(tenantId: string): Promise<boolean> {
		const tenant = await this.repo.findOne({
			where: { id: tenantId },
			select: ['id', 'requiresManualReview'],
		});
		return tenant?.requiresManualReview ?? false;
	}
}
