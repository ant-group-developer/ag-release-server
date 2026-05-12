import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('request_logs')
export class RequestLog extends BaseUUIDEntity {
	// ── Request ───────────────────────────────────────────────────────────────
	@Column()
	method: string; // GET | POST | PUT | DELETE...

	@Column()
	url: string; // URL thực tế: /api/users/123

	@Column()
	route: string; // URL pattern: /api/users/:id

	@Column({ nullable: true })
	ip: string;

	@Column({ nullable: true })
	userAgent: string;

	@Column('jsonb', { nullable: true })
	headers: Record<string, any>; // Bỏ Authorization, Cookie trước khi lưu

	@Column('jsonb', { nullable: true })
	body: Record<string, any>; // Mask các field nhạy cảm: password, token...

	@Column('jsonb', { nullable: true })
	query: Record<string, any>; // ?page=1&limit=10

	@Column('jsonb', { nullable: true })
	params: Record<string, any>; // { id: '123' }

	// ── Auth ──────────────────────────────────────────────────────────────────
	@Column({ nullable: true })
	userId: string; // null nếu chưa đăng nhập

	@Column({ nullable: true })
	userRole: string;

	// ── Response ──────────────────────────────────────────────────────────────
	@Column({ nullable: true })
	statusCode: number;

	@Column('jsonb', { nullable: true })
	responseBody: Record<string, any>; // Truncate nếu > 5KB

	@Column({ nullable: true })
	errorMessage: string;

	@Column({ nullable: true })
	errorName: string; // TypeError | PrismaClientKnownRequestError...

	@Column({ type: 'text', nullable: true })
	errorStack: string; // Stack trace đầy đủ, chỉ lưu khi 5xx

	@Column('jsonb', { nullable: true })
	errorCause: any; // Lỗi gốc nếu có wrap bằng { cause: originalErr }

	// ── Performance ───────────────────────────────────────────────────────────
	@Column({ type: 'float', nullable: true })
	duration: number; // Đơn vị ms
}
