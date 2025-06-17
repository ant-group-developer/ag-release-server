import { BaseEntityShortId } from 'src/database/dto/database.dto';
import { Column, Entity } from 'typeorm';

@Entity('genres')
export class Genre extends BaseEntityShortId {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string;
}
