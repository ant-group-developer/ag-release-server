import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReleaseQueryService } from 'src/modules/release/services/release.query.service';
import { ReleaseSnapshotWriter } from '../../application/ports/release-snapshot-writer.port';
import { ReleaseSnapshotOrmEntity } from '../persistence/release-snapshot.orm-entity';

/**
 * ReleaseSnapshotWriterAdapter — tạo snapshot bất biến lúc submit.
 *
 * Bọc ReleaseQueryService.findOneReleaseFull (load release + toàn bộ relation),
 * serialize thành jsonb, INSERT vào release_snapshot. Trả snapshotId.
 *
 * Serialize qua JSON round-trip để cắt circular ref (entity ↔ relation) + loại
 * method/getter — chỉ giữ dữ liệu thuần cho ValidateRunner + DdexXmlPackageBuilder đọc.
 */
@Injectable()
export class ReleaseSnapshotWriterAdapter implements ReleaseSnapshotWriter {
	private readonly logger = new Logger(ReleaseSnapshotWriterAdapter.name);

	constructor(
		@InjectRepository(ReleaseSnapshotOrmEntity)
		private readonly repo: Repository<ReleaseSnapshotOrmEntity>,
		private readonly releaseQuery: ReleaseQueryService,
	) {}

	async createFromRelease(releaseId: string): Promise<string> {
		const release = await this.releaseQuery.findOneReleaseFull({
			releaseId,
		});

		// JSON round-trip: cắt circular ref + chỉ giữ plain data.
		const payload = JSON.parse(JSON.stringify(release)) as Record<
			string,
			unknown
		>;

		const entity = this.repo.create({ releaseId, payload });
		const saved = await this.repo.save(entity);

		this.logger.log(
			`[createFromRelease] snapshot=${saved.id} release=${releaseId}`,
		);
		return saved.id;
	}
}
