import { ResponseError } from 'src/common/dtos/common.response.dto';

export class CiDistributionJobException {
	static NOT_FOUND(data?: any) {
		return new ResponseError({
			statusCode: 404,
			message: 'CI distribution job not found',
			messageCode: 'ciJob.error.notFound',
			data,
		});
	}

	static NO_IDS_PROVIDED(data?: any) {
		return new ResponseError({
			statusCode: 400,
			message: 'No job IDs provided',
			messageCode: 'ciJob.error.noIdsProvided',
			data,
		});
	}

	static INVALID_TYPE_EMAIL(invalidIds: string[]) {
		return new ResponseError({
			statusCode: 400,
			message: `autoSendEmail chỉ áp dụng cho type email_state51. Các job không hợp lệ: ${invalidIds.join(', ')}`,
			messageCode: 'ciJob.error.invalidTypeEmail',
			data: { invalidIds },
		});
	}

	static INVALID_TYPE_ADMIN_EXPORT(invalidIds: string[]) {
		return new ResponseError({
			statusCode: 400,
			message: `confirmCompleted chỉ áp dụng cho type admin_export. Các job không hợp lệ: ${invalidIds.join(', ')}`,
			messageCode: 'ciJob.error.invalidTypeAdminExport',
			data: { invalidIds },
		});
	}

	static INVALID_STATUS(
		action: string,
		allowedStatuses: string[],
		invalidJobs: { id: string; status: string }[],
	) {
		const detail = invalidJobs
			.map((j) => `${j.id}(${j.status})`)
			.join(', ');
		return new ResponseError({
			statusCode: 400,
			message: `${action} chỉ xử lý jobs có status ${allowedStatuses.join('/')}. Các job không hợp lệ: ${detail}`,
			messageCode: 'ciJob.error.invalidStatus',
			data: { action, allowedStatuses, invalidJobs },
		});
	}

	static JOBS_NOT_FOUND(data?: any) {
		return new ResponseError({
			statusCode: 404,
			message: 'Không tìm thấy jobs',
			messageCode: 'ciJob.error.jobsNotFound',
			data,
		});
	}
}
