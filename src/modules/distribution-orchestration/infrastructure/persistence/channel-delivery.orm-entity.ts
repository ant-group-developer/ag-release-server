import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';

/**
 * ORM entity map bảng "channel_delivery".
 * PK là channelId string (format "distId:ch:N") — deterministic từ Distribution.ensureChannelsSpawned.
 * Cột khớp ChannelDeliveryRow + ChannelDeliverySpec (domain).
 * KHÔNG map @ManyToOne về Distribution để tránh lazy/eager ẩn — repo dùng 2 query rõ ràng.
 */
@Entity('channel_delivery')
@Index('IDX_channel_delivery_distribution_id', ['distributionId'])
@Index('IDX_channel_delivery_state_scheduled_at', ['state', 'scheduledAt'])
export class ChannelDeliveryOrmEntity {
	@PrimaryColumn({ type: 'varchar', length: 80 })
	channelId!: string;

	@Column({ type: 'uuid' })
	distributionId!: string;

	/** Thứ tự spawn (N trong "ch:N") — giữ thứ tự channel khi load(). */
	@Column({ type: 'int' })
	spawnOrder!: number;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	// ── spec (config) ──
	@Column({ type: 'varchar', length: 30 })
	dspCode!: string;

	@Column({ type: 'varchar', length: 20 })
	topology!: string;

	@Column({ type: 'varchar', length: 60 })
	processCode!: string;

	@Column({ type: 'varchar', length: 30, nullable: true })
	aggregatorCode!: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	exportMethod!: string | null;

	@Column({ type: 'boolean', nullable: true })
	hasDeal!: boolean | null;

	// ── state (thay đổi theo turn) ──
	@Column({ type: 'int', default: 0 })
	pos!: number;

	@Column({ type: 'varchar', length: 20, default: 'PENDING' })
	state!: string;

	@Column({ type: 'int', default: 0 })
	retryCount!: number;

	@Column({ type: 'varchar', length: 80, nullable: true })
	ticketRef!: string | null;

	/** Khi WAITING: mốc wake-up. Handler set khi channel vào WAIT stage. */
	@Column({ type: 'timestamptz', nullable: true })
	scheduledAt!: Date | null;
}
