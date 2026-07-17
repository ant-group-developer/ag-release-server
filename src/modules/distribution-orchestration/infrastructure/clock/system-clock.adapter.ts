import { Injectable } from '@nestjs/common';

import { Clock } from '../../domain/ports/clock.port';

/**
 * SystemClock — adapter thật cho Clock port (prod).
 *
 * Trả về giờ hệ thống. Test KHÔNG dùng cái này — inject FixedClock để mô phỏng
 * "trôi thời gian" (thấy `test-doubles/fixed-clock.ts`).
 */
@Injectable()
export class SystemClock implements Clock {
	now(): Date {
		return new Date();
	}
}
