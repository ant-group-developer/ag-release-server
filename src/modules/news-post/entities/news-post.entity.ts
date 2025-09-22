import {
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';
import { NewsCategory } from 'src/modules/news-category/entities/news-category.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { NewsPostStatus } from '../enum/news-post.enum';

@Entity('news_posts')
export class NewsPost extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	titleVi: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	titleEn: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	descriptionVi: string | null;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NOTE, nullable: true })
	descriptionEn: string | null;

	@Column({ type: 'text' })
	contentVi: string;

	@Column({ type: 'text' })
	contentEn: string;

	@Column({ type: 'uuid', nullable: true })
	thumbnailId: string | null;

	@Column({
		type: 'enum',
		enum: NewsPostStatus,
		default: NewsPostStatus.PRIVATE,
	})
	status: NewsPostStatus;

	@Column({ type: 'uuid' })
	newsCategoryId: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	slug: string;

	@Column({ type: 'text', array: true, default: '{}' })
	keywords: string[];

	// relation
	@ManyToOne(() => NewsCategory, (category) => category.id)
	@JoinColumn({ name: 'news_category_id' })
	newsCategory: NewsCategory;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'thumbnail_id' })
	thumbnail: FileEntity | null;
}
