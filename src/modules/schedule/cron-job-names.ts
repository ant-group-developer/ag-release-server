/**
 * cron-job-names — tên duy nhất cho các @Cron cần điều khiển theo role.
 *
 * @nestjs/schedule yêu cầu tên cron duy nhất toàn app. Đặt tên ở một chỗ để:
 *   · @Cron(expr, { name: CRON_JOBS.OUTBOX_RELAY }) trong service
 *   · cron-role-map tham chiếu cùng hằng số → không lệch chuỗi giữa 2 nơi.
 */
export const CRON_JOBS = {
	OUTBOX_RELAY: 'outbox-relay',
} as const;

export type CronJobName = (typeof CRON_JOBS)[keyof typeof CRON_JOBS];
