import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { WithUserRelations } from 'src/common/mixins/user-relations.mixin';
import { ArtistProfile } from 'src/modules/artist-profile/entities/artist-profile.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { DspAction } from 'src/modules/dsp-action/entities/dsp-action.entities';
import { ReleaseDsp } from 'src/modules/release-dsp/entities/release-dsp.entity';
import { TrackPolicy } from 'src/modules/track-policy/entities/track-policy.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('dsps')
export class Dsp extends WithUserRelations(BaseUserTrackedCustomIDEntity) {
	@Column({
		type: 'varchar',
		unique: true,
		length: DEFAULT_LENGTH_NAME,
	})
	name: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({ type: 'varchar', length: LENGTH_PICTURE, nullable: true })
	picture: string | null;

	@Column({ type: 'boolean', default: false })
	isActive: boolean;

	@Column('varchar', {
		array: true,
		nullable: false,
		length: 100,
		default: [],
	})
	formatLinks: string[];

	@Column({ type: 'boolean', default: false })
	enablePolicy: boolean;

	// relation
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.dsp)
	releaseDsps: ReleaseDsp[];

	@OneToMany(() => ArtistProfile, (artistProfile) => artistProfile.dsp)
	artistProfiles: ArtistProfile[];

	@OneToMany(() => DspAction, (dspAction) => dspAction.dsp)
	dspActions: DspAction[] | [];

	@OneToMany(() => TrackPolicy, (trackPolicy) => trackPolicy.dsp)
	trackPolicies?: TrackPolicy[];

	// count relation
	releaseDspsCount?: number;
}
