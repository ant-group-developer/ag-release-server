import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { NewsCategory } from 'src/modules/news-category/entities/news-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { NewsPostStatus } from '../enum/news-post.enum';
import { NewsPostTranslation } from './news-post-translation.entity';

@Entity('news_posts')
export class NewsPost extends BaseUserTrackedUUIDEntity {
	// vitual column
	title?: string | null;
	description?: string | null;
	content?: string | null;
	languageCode?: string | null;
	languageName?: string | null;

	@Column({ type: 'varchar', length: LENGTH_PICTURE, nullable: true })
	thumbnail: string | null;

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

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@OneToMany(
		() => NewsPostTranslation,
		(newsPostTranslation) => newsPostTranslation.newsPost,
	)
	newsPostTranslations: NewsPostTranslation[];
}
