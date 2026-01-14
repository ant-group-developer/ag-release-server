import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_EMAIL,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { DistributionChannel } from './distribution-channel.entity';

@Entity('aggregators', {
	comment:
		'Aggregator là bên trung gian phân phối nội dung lên DSP (ANT, Merlin, FUGA, Direct...)',
})
@Index(['code'], { unique: true })
@Index(['name'], { unique: true })
export class Aggregator extends BaseUserTrackedUUIDEntity {
	// =========================
	// BASIC INFO
	// =========================

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		comment: 'Mã định danh aggregator (ant, merlin, fuga, direct...)',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên hiển thị của aggregator',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_EMAIL,
		nullable: true,
		comment: 'Email liên hệ kỹ thuật / vận hành',
	})
	contactEmail?: string;

	// =========================
	// RELATIONS
	// =========================

	@OneToMany(
		() => DistributionChannel,
		(distributionChannel) => distributionChannel.aggregator,
	)
	distributionChannels: DistributionChannel[];
}

// sql

// CREATE TABLE aggregators (
//     id uuid PRIMARY KEY,

//     code varchar(${DEFAULT_LENGTH_CODE}) NOT NULL,
//     name varchar(${DEFAULT_LENGTH_NAME}) NOT NULL,
//     contact_email varchar(${DEFAULT_LENGTH_EMAIL}),

//     creator_id uuid NOT NULL,
//     modifier_id uuid NOT NULL,

//     created_at timestamptz NOT NULL DEFAULT now(),
//     updated_at timestamptz NOT NULL DEFAULT now()
// );

// -- UNIQUE CONSTRAINTS
// CREATE UNIQUE INDEX uq_aggregators_code ON aggregators (code);
// CREATE UNIQUE INDEX uq_aggregators_name ON aggregators (name);

// -- COMMENTS
// COMMENT ON TABLE aggregators IS
// 'Aggregator là bên trung gian phân phối nội dung lên DSP (ANT, Merlin, FUGA, Direct...)';

// COMMENT ON COLUMN aggregators.code IS
// 'Mã định danh aggregator (ant, merlin, fuga, direct...)';

// COMMENT ON COLUMN aggregators.name IS
// 'Tên hiển thị của aggregator';

// COMMENT ON COLUMN aggregators.contact_email IS
// 'Email liên hệ kỹ thuật / vận hành';
