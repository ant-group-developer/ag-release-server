import { BaseEntityUserCreatorLongId } from 'src/database/entities/database.entity';
import { Column, Entity } from 'typeorm';
import { UserType } from '../enum/user.enum';

@Entity('users')
// extends BaseEntityUserCreatorLongId
export class UserEntity extends BaseEntityUserCreatorLongId {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	email: string;

	@Column({ type: 'enum', enum: UserType, default: UserType.USER })
	type: UserType;

	@Column({ name: 'is_active', type: 'boolean', default: true })
	isActive: boolean;

	// @Column({ name: 'creator_id', length: DBConst.LENGTH_ID.DEFAULT })
	// creatorId: string;

	// @ManyToOne(() => UserEntity)
	// @JoinColumn({ name: 'creator_id' })
	// creator: IUserSchema;

	// @Column({ name: 'modifier_id', length: DBConst.LENGTH_ID.DEFAULT })
	// modifierId: string;

	// @ManyToOne(() => UserEntity)
	// @JoinColumn({ name: 'modifier_id' })
	// modifier: IUserSchema;

	// @PrimaryColumn({
	// 	type: 'varchar',
	// 	length: DBConst.LENGTH_ID.DEFAULT,
	// })
	// id: string;

	// @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	// createdAt: Date;

	// @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	// updatedAt: Date;

	// @BeforeInsert()
	// generateId() {
	// 	this.id = this.generateIdByLength(DBConst.LENGTH_ID.DEFAULT);
	// }

	// public generateIdByLength(length: number): string {
	// 	return nanoid(length);
	// }
}
