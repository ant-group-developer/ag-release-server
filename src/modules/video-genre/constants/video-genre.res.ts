import { NotFoundException } from '@nestjs/common';

export class VideoGenreException {
	static NOT_FOUND() {
		return new NotFoundException('Video Genre not found');
	}
}

export class VideoGenreSuccess {
	static CREATE(data: any) {
		return {
			success: true,
			code: 201,
			message: 'Video Genre created successfully',
			data,
		};
	}

	static COMMON(data: any) {
		return {
			success: true,
			code: 200,
			message: 'Success',
			data,
		};
	}

	static UPDATE(data: any) {
		return {
			success: true,
			code: 200,
			message: 'Video Genre updated successfully',
			data,
		};
	}

	static DELETE() {
		return {
			success: true,
			code: 200,
			message: 'Video Genre deleted successfully',
		};
	}
}
