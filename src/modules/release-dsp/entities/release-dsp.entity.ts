import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_dsp', {
	comment: 'Bảng liên kết release với các DSP được phân phối',
})
export class ReleaseDsp extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID release',
	})
	releaseId: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID DSP',
	})
	dspId: string;

	@ManyToOne(() => Release, (release) => release.releaseDsp)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@ManyToOne(() => Dsp, (dsp) => dsp.releaseDsps)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
