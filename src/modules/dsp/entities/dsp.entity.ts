import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { WithUserRelations } from 'src/common/mixins/user-relations.mixin';
import { OrganizationDsp } from 'src/modules/organization-dsp/entities/organization-dsp.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('dsps')
export class Dsp extends WithUserRelations(BaseUserTrackedCustomIDEntity) {
	@Column({ name: 'name', type: 'varchar', unique: true, length: 100 })
	name: string;

	@Column({ name: 'picture', type: 'varchar', length: 100, nullable: true })
	picture: string | null;

	@Column({
		name: 'can_link_artist_profile',
		type: 'boolean',
		default: false,
	})
	canLinkArtistProfile: boolean;

	@OneToMany(() => OrganizationDsp, (organizationDsp) => organizationDsp.dsp)
	organizationDsps: OrganizationDsp[];
}
