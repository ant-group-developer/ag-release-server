/**
 * TenantReader port — đọc thuộc tính tenant cần cho orchestration.
 *
 * Application chỉ biết port này; adapter (infrastructure) bọc tenant repo.
 * Giữ domain/application sạch khỏi TypeORM (no-framework-import.spec).
 */
export interface TenantReader {
	/**
	 * Cờ duyệt thủ công của tenant. true → distribution dừng IN_REVIEW sau validate.
	 * Tenant không tồn tại → false (an toàn: không chặn luồng vì thiếu cờ).
	 */
	requiresManualReview(tenantId: string): Promise<boolean>;
}

// DI token
export const TENANT_READER = Symbol('TenantReader');
