import { BaseEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { ErnVersion } from './release-ddex.enum';

@Entity({ name: 'release_ddex' })
export class ReleaseDdex extends BaseEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({
		type: 'enum',
		enum: ErnVersion,
	})
	ernVersion: ErnVersion;

	@Column({ type: 'text' })
	path: string;
}
