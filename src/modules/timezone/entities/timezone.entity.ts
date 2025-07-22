import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('timezones')
export class Timezone extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	utc: string;

	@Column({ type: 'varchar', length: 100 })
	zone: string;

	// relation
	@OneToMany(() => Release, (release) => release.timeZone)
	releases: Release[]

	// count relation
	releasesCount?: number
}
