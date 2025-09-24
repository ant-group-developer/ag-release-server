import dayjs from 'dayjs';
import { DateFormat } from 'src/common/enums/common';

export function getDateRange(dateRange?: Date[]): Date[] {
	const defaultValue = [
		dayjs().startOf('month').toDate(),
		dayjs().endOf('month').toDate(),
	];
	const [start, end] = dateRange?.length === 2 ? dateRange : defaultValue;
	return [start, end];
}

export function generateFileNameWithTimestamp(
	originalFileName: string,
	format: DateFormat = DateFormat.YYYYMMDDHHmmss,
): string {
	const timestamp = getTimeStamp(format);
	return `${timestamp}_${originalFileName}`;
}

export function getTimeStamp(format: DateFormat = DateFormat.YYYYMMDDHHmmss) {
	const timestamp = dayjs().format(format);
	return timestamp;
}
