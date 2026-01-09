import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Action } from 'src/modules/action/entities/action.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('track_policy', {
	comment: 'Chính sách áp dụng cho từng track theo DSP và hành động',
})
@Unique(['trackId', 'actionId', 'dspId'])
export class TrackPolicy extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID track',
	})
	trackId: string;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'ID hành động áp dụng (có thể NULL nếu dùng mặc định)',
	})
	actionId: string | null;

	@Column({
		type: 'uuid',
		comment: 'ID DSP áp dụng chính sách',
	})
	dspId: string;

	@ManyToOne(() => Track, (track) => track.trackPolicies)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@ManyToOne(() => Action, (action) => action.trackPolicies, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'action_id' })
	action: Action | null;

	@ManyToOne(() => Dsp, (dsp) => dsp.trackPolicies)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
