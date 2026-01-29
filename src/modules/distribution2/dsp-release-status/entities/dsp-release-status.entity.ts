import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity({ name: 'dsp_release_status' })
@Index(['dspId', 'releaseId'], { unique: true })
export class DspReleaseStatus extends BaseUUIDEntity {
	@Column({ type: 'varchar' })
	dspId: string;

	@Column({ type: 'varchar' })
	releaseId: string;

	@Column({ type: 'enum', enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
	status: ReleaseStatus;

	// @Column({
	// 	type: 'enum',
	// 	enum: RoutingModeEnum,
	// 	default: RoutingModeEnum.AGGREGATOR,
	// })
	// mode: RoutingModeEnum;

	@ManyToOne(() => Dsp, (dsp) => dsp.releaseStatuses, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'dsp_id', referencedColumnName: 'id' })
	dsp: Dsp;

	// @ManyToOne(() => Release, (release) => release.dspStatuses, {
	// 	onDelete: 'CASCADE',
	// })
	// @JoinColumn({ name: 'release_id', referencedColumnName: 'id' })
	// release: Release;
}
