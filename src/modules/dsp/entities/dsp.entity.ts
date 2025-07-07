import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { WithUserRelations } from 'src/common/mixins/user-relations.mixin';
import { lengthPicture } from 'src/modules/database/constants/database.constants';
import { OrganizationDsp } from 'src/modules/organization-dsp/entities/organization-dsp.entity';
import { ReleaseDsp } from 'src/modules/release-dsp/entities/release-dsp.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('dsps')
export class Dsp extends WithUserRelations(BaseUserTrackedCustomIDEntity) {
	@Column({ name: 'name', type: 'varchar', unique: true, length: 100 })
	name: string;

	@Column({
		name: 'picture',
		type: 'varchar',
		length: lengthPicture,
		nullable: true,
	})
	picture: string | null;

	@Column({
		name: 'can_link_artist_profile',
		type: 'boolean',
		default: false,
	})
	canLinkArtistProfile: boolean;

	// relation
	@OneToMany(() => OrganizationDsp, (organizationDsp) => organizationDsp.dsp)
	organizationDsps: OrganizationDsp[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => ReleaseDsp, (releaseDsp) => releaseDsp.dsp)
	releaseDsp: ReleaseDsp[];
}
