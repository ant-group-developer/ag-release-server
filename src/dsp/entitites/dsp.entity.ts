import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { OrganizationDsp } from 'src/organization-dsp/entities/organization-dsp.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('dsps')
export class Dsp extends BaseEntityLongId {
	@Column({ name: 'name', type: 'varchar', unique: true, length: 100 })
	name: string;

	@Column({ name: 'picture', type: 'varchar', length: 100, nullable: true })
	picture: string;

	@Column({
		name: 'can_link_artist_profile',
		type: 'boolean',
		default: false,
	})
	canLinkArtistProfile: boolean;

	@OneToMany(() => OrganizationDsp, (OrganizationDsp) => OrganizationDsp.dsp)
	OrganizationDsps: OrganizationDsp[];
}
