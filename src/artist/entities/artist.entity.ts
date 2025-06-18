import { BaseEntityUserCreatorShortId } from 'src/database/entities/database.entity';
import { Column, Entity } from 'typeorm';

@Entity('artists')
export class Artist extends BaseEntityUserCreatorShortId {
	// @Column({
	// 	name: 'creator_id',
	// 	type: 'varchar',
	// 	length: DatabaseConstant.ID_LONG_LENGTH,
	// })
	// creatorId: string;

	// // @ManyToOne(() => User)
	// // @JoinColumn({ name: 'creator_id' })
	// // creator: User;

	// @Column({
	// 	name: 'modifier_id',
	// 	type: 'varchar',
	// 	length: DatabaseConstant.ID_LONG_LENGTH,
	// })
	// modifierId: string;

	// // @ManyToOne(() => User)
	// // @JoinColumn({ name: 'modifier_id' })
	// // modifier: User;

	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string;

	@Column({ type: 'varchar', length: 250, nullable: true })
	biography: string;
}
