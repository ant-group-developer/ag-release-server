import { BaseEntityUserCreatorLongId } from 'src/database/dto/database.dto';
import { Column, Entity } from 'typeorm';
import { UserType } from '../enum/user.enum';

@Entity('users')
export class User extends BaseEntityUserCreatorLongId {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	email: string;

	@Column({ type: 'enum', default: UserType.USER })
	type: UserType;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;
}
