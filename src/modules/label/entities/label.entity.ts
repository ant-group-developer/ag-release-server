import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MediaUrlTransformer } from 'src/utils/util';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';

@Entity('labels', {
	comment: 'Danh mục label / hãng phát hành nhạc thuộc từng tenant',
})
@Unique(['name', 'tenantId'])
@Unique(['code', 'tenantId'])
export class Label extends BaseUserTrackedCustomIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên label / hãng phát hành',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		comment: 'Mã label duy nhất trong cùng tenant',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Ảnh đại diện hoặc logo của label',
		transformer: MediaUrlTransformer
	})
	picture: string | null;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Mô tả ngắn về label',
	})
	description: string | null;

	@OneToMany(() => Release, (release) => release.label)
	releases: Release[];

	@Column({
		type: 'uuid',
		comment: 'ID tenant sở hữu label này',
	})
	tenantId: string;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	releaseCount?: number;
	trackCount?: number;
}
