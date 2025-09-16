import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Action } from 'src/modules/action/entities/action.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('track_policy')
@Unique(['trackId', 'actionId', 'dspId'])
export class TrackPolicy extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 10 })
	trackId: string;

	@Column({ type: 'uuid', nullable: true })
	actionId: string | null;

	@Column({ type: 'uuid' })
	dspId: string;

	// relation
	@ManyToOne(() => Track, (track) => track.trackPolicies)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@ManyToOne(() => Action, (action) => action.trackPolicies)
	@JoinColumn({ name: 'action_id' })
	action: Action | null;

	@ManyToOne(() => Dsp, (dsp) => dsp.trackPolicies)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
