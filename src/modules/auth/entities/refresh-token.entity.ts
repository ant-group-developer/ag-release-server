import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('refresh_tokens', {
	comment: 'Lưu trữ refresh token phục vụ xác thực, thu hồi và xoay vòng JWT',
})
export class RefreshToken extends BaseUUIDEntity {
	@Index({ unique: true })
	@Column({
		type: 'varchar',
		length: 64,
		comment: 'JWT ID (jti) duy nhất, lấy từ payload của refresh token',
	})
	jti!: string;

	@Index()
	@Column({
		type: 'uuid',
		comment: 'ID người dùng sở hữu refresh token',
	})
	userId!: string;

	@Column({
		type: 'varchar',
		length: 128,
		comment: 'Giá trị hash (SHA-256) của refresh token',
	})
	hashedToken!: string;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm refresh token bị thu hồi',
	})
	revokedAt!: Date | null;

	@Column({
		type: 'varchar',
		length: 64,
		nullable: true,
		comment: 'jti mới được thay thế sau khi xoay vòng token',
	})
	replacedBy!: string | null;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm refresh token hết hạn',
	})
	expiresAt!: Date | null;
}
