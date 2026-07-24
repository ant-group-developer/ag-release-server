import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TicketIssueItem } from '../../domain/value-objects/ticket-metadata.vo';
import { DistributionOrmEntity } from '../../infrastructure/persistence/distribution.orm-entity';
import { OrchestrationTicketOrmEntity } from '../../infrastructure/persistence/orchestration-ticket.orm-entity';

/**
 * Ticket đọc ra cho client — chuẩn hoá mọi nguồn (reviewer REVIEW_REJECT, QA_FLAG,
 * *_FAIL) về cùng 1 shape. Client render `items[]` bằng 1 component, không switch theo reason.
 */
export interface DistributionTicketView {
	id: string;
	distributionId: string;
	channelId: string | null;
	reason: string;
	detail: string;
	status: string;
	/** Danh sách issue chuẩn hoá (rỗng nếu ticket không có metadata). */
	items: TicketIssueItem[];
	/** Context bổ sung (UPC, batchId...) — optional render. */
	context: Record<string, unknown> | null;
	createdAt: Date;
	resolvedAt: Date | null;
}

/**
 * DistributionTicketQueryService — read-side liệt kê orchestration_ticket theo distribution.
 * Tách khỏi PostgresTicketAdapter (command-side: open/resolve) để giữ CQRS.
 */
@Injectable()
export class DistributionTicketQueryService {
	constructor(
		@InjectRepository(OrchestrationTicketOrmEntity)
		private readonly ticketRepo: Repository<OrchestrationTicketOrmEntity>,
		@InjectRepository(DistributionOrmEntity)
		private readonly distRepo: Repository<DistributionOrmEntity>,
	) {}

	/**
	 * Mọi ticket của 1 distribution, mới nhất trước.
	 * `allowedTenantIds` undefined = system admin (bỏ qua scope); ngược lại chặn cross-tenant.
	 */
	async listByDistribution(
		distributionId: string,
		allowedTenantIds?: string[],
	): Promise<DistributionTicketView[]> {
		await this.assertOwnership(distributionId, allowedTenantIds);

		const rows = await this.ticketRepo.find({
			where: { distributionId },
			order: { createdAt: 'DESC' },
		});

		return rows.map((row) => this.toView(row));
	}

	/** distribution tồn tại (404) + thuộc tenant được phép (403). */
	private async assertOwnership(
		distributionId: string,
		allowedTenantIds?: string[],
	): Promise<void> {
		const dist = await this.distRepo.findOne({
			where: { id: distributionId },
			select: { id: true, tenantId: true },
		});
		if (!dist) throw new NotFoundException('Distribution not found');
		if (allowedTenantIds && !allowedTenantIds.includes(dist.tenantId)) {
			throw new ForbiddenException('Distribution outside tenant scope');
		}
	}

	private toView(row: OrchestrationTicketOrmEntity): DistributionTicketView {
		const meta = (row.metadata ?? null) as {
			items?: TicketIssueItem[];
			context?: Record<string, unknown>;
		} | null;

		return {
			id: row.id,
			distributionId: row.distributionId,
			channelId: row.channelId,
			reason: row.reason,
			detail: row.detail,
			status: row.status,
			items: meta?.items ?? [],
			context: meta?.context ?? null,
			createdAt: row.createdAt,
			resolvedAt: row.resolvedAt,
		};
	}
}
