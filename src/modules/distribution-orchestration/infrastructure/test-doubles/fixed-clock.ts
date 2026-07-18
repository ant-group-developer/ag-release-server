import { Clock } from '../../domain/ports/clock.port';

/**
 * FixedClock — test double cho Clock. Trả về mốc thời gian cố định, đổi qua set()/advance()
 * để mô phỏng "trôi thời gian" trong test mà không cần chờ thật.
 */
export class FixedClock implements Clock {
	constructor(private current: Date) {}

	now(): Date {
		return this.current;
	}

	set(at: Date): void {
		this.current = at;
	}

	advance(ms: number): void {
		this.current = new Date(this.current.getTime() + ms);
	}
}
