/**
 * app-role — nguồn sự thật DUY NHẤT cho vai trò process của app.
 *
 * Process rẽ nhánh theo biến môi trường APP_ROLE (xem main.ts):
 *   · 'api'    → HTTP server, nhận request. Mọi @Cron mặc định bị tắt.
 *   · 'worker' → không mở HTTP port, chạy cron + BullMQ worker + background jobs.
 *
 * TẤT CẢ nơi cần kiểm tra role PHẢI import từ file này — KHÔNG hardcode
 * chuỗi 'worker'/'api' hay đọc process.env.APP_ROLE rải rác, để sau này đổi
 * tên role hoặc thêm role mới chỉ sửa một chỗ.
 */

export const AppRole = {
	API: 'api',
	WORKER: 'worker',
} as const;

export type AppRole = (typeof AppRole)[keyof typeof AppRole];

/** Role mặc định khi APP_ROLE không set (khớp main.ts). */
export const DEFAULT_APP_ROLE: AppRole = AppRole.API;

/**
 * Đọc role hiện tại từ APP_ROLE. Giá trị lạ → về DEFAULT_APP_ROLE.
 */
export function currentRole(): AppRole {
	return process.env.APP_ROLE === AppRole.WORKER
		? AppRole.WORKER
		: DEFAULT_APP_ROLE;
}

/** Tiện ích: process hiện tại có phải worker không. */
export function isWorker(): boolean {
	return currentRole() === AppRole.WORKER;
}
