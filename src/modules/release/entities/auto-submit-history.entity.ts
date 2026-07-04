import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('auto_submit_history')
export class AutoSubmitHistory extends BaseUUIDEntity {
	@Column({ type: 'jsonb' })
	input: Record<string, any>;

	@Column({ name: 'preview_data', type: 'jsonb' })
	previewData: Record<string, any>;

	@Column({ name: 'total_releases', type: 'int', default: 0 })
	totalReleases: number;
}
