import dayjs from 'dayjs';

export function getDateRange(dateRange?: Date[]): Date[] {
	const defaultValue = [
		dayjs().startOf('month').toDate(),
		dayjs().endOf('month').toDate(),
	];
	const [start, end] = dateRange?.length === 2 ? dateRange : defaultValue;
	return [start, end];
}
