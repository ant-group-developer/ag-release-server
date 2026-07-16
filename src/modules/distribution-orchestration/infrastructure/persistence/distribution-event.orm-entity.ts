import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * ORM entity map bảng "distribution_event" — event store (timeline + audit).
 * 3 cột chiếu (type/channelId/level) index nhanh, payload jsonb đầy đủ.
 * Bigserial id giữ thứ tự chèn (ORDER BY id = ORDER BY thời gian).
 */
@Entity('distribution_event')
@Index('IDX_distribution_event_distribution_id_id', ['distributionId', 'id'])
@Index('IDX_distribution_event_type', ['type'])
export class DistributionEventOrmEntity {
	@PrimaryGeneratedColumn('increment', { type: 'bigint' })
	id!: string; // bigint returned as string — tránh precision loss

	@Column({ type: 'uuid' })
	distributionId!: string;

	/** NULL với event cấp distribution; set với event cấp channel. */
	@Column({ type: 'varchar', length: 80, nullable: true })
	channelId!: string | null;

	/** Tên factory bỏ 'make', VD 'DistributionSubmitted', 'Waiting', 'ChannelLive'. */
	@Column({ type: 'varchar', length: 60 })
	type!: string;

	/** milestone = event đổi state (user thấy); progress = chi tiết trong stage (admin only). */
	@Column({ type: 'varchar', length: 20, default: 'milestone' })
	level!: string;

	@Column({ type: 'jsonb', default: () => "'{}'" })
	payload!: Record<string, unknown>;

	/** Clock.now() từ domain, KHÔNG phải giờ INSERT. */
	@Column({ type: 'timestamptz' })
	occurredAt!: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
