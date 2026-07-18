/**
 * DI token cho Clock port (domain/ports/clock.port.ts).
 *
 * Token đặt ở application/ (không phải domain/) vì:
 *   · Domain phải sạch framework — không được có Symbol từ NestJS mà app dùng DI.
 *   · Application biết cả Clock interface (domain) + DI needs (NestJS) → chỗ đúng.
 *
 * Cùng pattern với WORKFLOW_ENGINE, UNIT_OF_WORK, DISTRIBUTION_REPOSITORY.
 */
export const CLOCK = Symbol('Clock');
