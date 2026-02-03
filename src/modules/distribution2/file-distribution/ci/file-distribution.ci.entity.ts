// // src/modules/distribution-ci/entities/distribution-ci-history.entity.ts
// import { BaseUUIDEntity } from 'src/common/entities/base.entity';
// import { Release } from 'src/modules/release/entities/release.entity';
// import { Column, Entity, Index, ManyToOne } from 'typeorm';

// export enum CiJobStatus {
// 	PENDING = 'PENDING',
// 	RUNNING = 'RUNNING',
// 	SUCCESS = 'SUCCESS',
// 	FAILED = 'FAILED',
// }

// @Entity({ name: 'distribution_ci_history' })
// @Index(['releaseId', 'createdAt'])
// @Index(['batchId'])
// @Index(['upc'])
// export class DistributionCiHistory extends BaseUUIDEntity {
// 	// ===== relations =====
// 	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
// 	release: Release;

// 	@Column({ type: 'uuid' })
// 	releaseId: string;

// 	// ===== identifiers =====
// 	@Column({ type: 'varchar', length: 64 })
// 	batchId: string;

// 	@Column({ type: 'varchar', length: 32, nullable: true })
// 	upc: string | null;

// 	// ===== status tracking =====
// 	@Column({
// 		type: 'enum',
// 		enum: CiJobStatus,
// 		default: CiJobStatus.PENDING,
// 	})
// 	status: CiJobStatus;

// 	@Column({ type: 'timestamptz', nullable: true })
// 	startedAt: Date | null;

// 	@Column({ type: 'timestamptz', nullable: true })
// 	finishedAt: Date | null;

// 	@Column({ type: 'int', default: 0 })
// 	durationMs: number;

// 	// ===== outputs =====
// 	@Column({ type: 'text', nullable: true })
// 	outputDir: string | null; // vd: release_parsed/<batchId>/<upc>

// 	@Column({ type: 'text', nullable: true })
// 	excelPath: string | null; // vd: .../<upc>.xlsx

// 	@Column({ type: 'text', nullable: true })
// 	coverPath: string | null; // vd: .../<upc>.jpg

// 	@Column({ type: 'int', default: 0 })
// 	trackCount: number;

// 	// ===== error / debug =====
// 	@Column({ type: 'text', nullable: true })
// 	errorMessage: string | null;

// 	@Column({ type: 'text', nullable: true })
// 	errorStack: string | null;

// 	// @Column({ type: 'jsonb', nullable: true })
// 	// meta: Record<string, any> | null; // lưu thêm: templatePath, countries include/exclude, ...
// }
