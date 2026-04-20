import { User } from 'src/modules/user/entities/user.entity';
import { JoinColumn, ManyToOne } from 'typeorm';

type Constructor<T = object> = abstract new (...args: any[]) => T;

export function WithUserRelations<T extends Constructor>(Base: T) {
	abstract class UserRelationsMixin extends Base {
		@ManyToOne(() => User)
		@JoinColumn({ name: 'creator_id' })
		creator: User | null;

		@ManyToOne(() => User)
		@JoinColumn({ name: 'modifier_id' })
		modifier: User | null;
	}

	return UserRelationsMixin;
}
