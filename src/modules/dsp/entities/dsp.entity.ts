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

@Entity('dsps', {
	comment:
		'Danh mục các nền tảng DSP (Digital Service Provider) trong hệ thống',
})
export class Dsp extends WithUserRelations(BaseUserTrackedCustomIDEntity) {
	@Column({
		type: 'varchar',
		unique: true,
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên nền tảng DSP',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã DSP duy nhất trong hệ thống',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Ảnh đại diện hoặc logo của DSP',
	})
	picture: string | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu DSP đang được kích hoạt hay không',
	})
	isActive: boolean;

	@Column('varchar', {
		array: true,
		nullable: false,
		length: 100,
		default: [],
		comment:
			'Danh sách format link dùng để nhận diện hoặc map URL nghệ sĩ/track',
	})
	formatLinks: string[];

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Bật/tắt hệ thống policy cho DSP này',
	})
	enablePolicy: boolean;

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

	releaseDspsCount?: number;
}
