import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
	ReleaseSnapshot,
	ReleaseSnapshotReader,
} from '../../application/ports/release-snapshot-reader.port';
import { ReleaseSnapshotOrmEntity } from '../persistence/release-snapshot.orm-entity';

/**
 * ReleaseSnapshotReaderAdapter — đọc release_snapshot jsonb qua TypeORM.
 *
 * Adapter này isolate domain/application khỏi ORM entity.
 * Trả về ReleaseSnapshot DTO thay vì raw ORM entity.
 */
@Injectable()
export class ReleaseSnapshotReaderAdapter implements ReleaseSnapshotReader {
	constructor(
		@InjectRepository(ReleaseSnapshotOrmEntity)
		private readonly repo: Repository<ReleaseSnapshotOrmEntity>,
	) {}

	async loadById(snapshotId: string): Promise<ReleaseSnapshot | null> {
		const entity = await this.repo.findOne({ where: { id: snapshotId } });
		if (!entity) return null;

		// Cast jsonb payload to typed structure
		const payload = entity.payload;

		return {
			id: entity.id,
			releaseId: entity.releaseId,
			title: this.getString(payload, 'title'),
			upc: this.getString(payload, 'upc'),
			labelId: this.getString(payload, 'labelId'),
			primaryGenreId: this.getString(payload, 'primaryGenreId'),
			albumFormatId: this.getString(payload, 'albumFormatId'),
			priceTierId: this.getString(payload, 'priceTierId'),
			cLineYear: this.getNumber(payload, 'cLineYear'),
			cLineOwner: this.getString(payload, 'cLineOwner'),
			pLineYear: this.getNumber(payload, 'pLineYear'),
			pLineOwner: this.getString(payload, 'pLineOwner'),
			releaseDate: this.getString(payload, 'releaseDate'),
			tracks: this.getArray(payload, 'tracks') as any,
			releaseArtists: this.getArray(payload, 'releaseArtists') as any,
			releaseCoverArts: this.getArray(payload, 'releaseCoverArts') as any,
			territories: this.getArray(payload, 'territories') as any,
			payload,
		};
	}

	private getString(
		obj: Record<string, unknown>,
		key: string,
	): string | null {
		const val = obj[key];
		return typeof val === 'string' ? val : null;
	}

	private getNumber(
		obj: Record<string, unknown>,
		key: string,
	): number | null {
		const val = obj[key];
		return typeof val === 'number' ? val : null;
	}

	private getArray(
		obj: Record<string, unknown>,
		key: string,
	): Array<Record<string, unknown>> {
		const val = obj[key];
		return Array.isArray(val) ? val : [];
	}
}
