import { BaseEntityUUID } from 'src/database/entities/database.entity';
import { OrganizationDsp } from 'src/organization-dsp/entities/organization-dsp.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('dsps')
export class Dsp extends BaseEntityUUID {
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

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
