import { AppRole } from '../../common/constants/app-role';
import { CRON_JOBS } from './cron-job-names';

/**
 * cron-role-map — khai báo mỗi cron job (theo TÊN đặt qua @Cron(..., { name }))
 * được phép chạy ở những role nào.
 *
 * Đây là nguồn sự thật để ScheduleService quyết định GIỮ hay XÓA cron sau khi
 * @nestjs/schedule đã đăng ký tất cả decorator @Cron lúc bootstrap.
 *
 * Quy tắc:
 *   · Cron CÓ tên trong map → chạy đúng các role liệt kê.
 *   · Cron KHÔNG có tên trong map (chưa đặt tên / chưa khai báo) → về
 *     DEFAULT_ROLES = ['worker'] — giữ hành vi cũ (mọi cron chỉ chạy ở worker),
 *     an toàn khi scale nhiều instance api.
 *
 * Muốn đổi role của cron: sửa DUY NHẤT ở đây, không lục từng file.
 */
export const CRON_ROLE_MAP: Record<string, readonly AppRole[]> = {
	// Outbox relay: poll dùng SELECT ... FOR UPDATE SKIP LOCKED nên an toàn
	// khi chạy song song nhiều process. Hiện để ở worker theo thiết kế tách process.
	// Muốn SSE realtime ngay trên process api thì thêm AppRole.API vào mảng.
	[CRON_JOBS.OUTBOX_RELAY]: [AppRole.WORKER],
};

/** Role mặc định cho cron chưa khai báo trong map. */
const DEFAULT_ROLES: readonly AppRole[] = [AppRole.WORKER];

export function rolesForCron(name: string): readonly AppRole[] {
	return CRON_ROLE_MAP[name] ?? DEFAULT_ROLES;
}

export function cronAllowedOnRole(name: string, role: AppRole): boolean {
	return rolesForCron(name).includes(role);
}
