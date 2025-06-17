import { BaseEntityUserCreatorLongId } from 'src/database/dto/database.dto';
import { Genre } from 'src/genre/entities/genre.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReleaseStatus, ReleaseType } from '../enum/release.enum';

@Entity('releases')
export class Release extends BaseEntityUserCreatorLongId {
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

	@Column({ type: 'varchar', length: 20, nullable: true })
	upc: string;

	@Column({ name: 'primary_genre_id', type: 'varchar', length: 10 })
	primaryGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre;

	@Column({ name: 'sub_genre_id', type: 'varchar', length: 10 })
	subGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre;

	@Column({ name: 'label_id', type: 'varchar', length: 10 })
	labelId: string;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string;

	@Column({ type: 'enum', default: ReleaseStatus.DRAFT })
	status: ReleaseStatus;

	@Column({ type: 'enum' })
	type: ReleaseType;
}
