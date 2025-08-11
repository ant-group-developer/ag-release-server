import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken extends BaseUUIDEntity {
	@Index({ unique: true })
	@Column({ type: 'varchar', length: 64 })
	jti!: string; // from JWT

	@Index()
	@Column({ type: 'uuid' })
	userId!: string;

	@Column({ type: 'varchar', length: 128 })
	hashedToken!: string; // sha256(token)

	@Column({ type: 'timestamptz', nullable: true })
	revokedAt!: Date | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	replacedBy!: string | null; // new jti after rotation

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt!: Date | null;
}
