// src/modules/file-node/const/file-node.const.ts
import {
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';

export class FileNodeSuccess {
	static CREATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Create success',
			messageCode: 'fileNode.message.success.create',
			data,
		});
	}

	static UPDATE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Update success',
			messageCode: 'fileNode.message.success.update',
			data,
		});
	}

	static DELETE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Delete success',
			messageCode: 'fileNode.message.success.delete',
			data,
		});
	}

	static DETAIL<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get detail success',
			messageCode: 'fileNode.message.success.detail',
			data,
		});
	}

	static LIST<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get list success',
			messageCode: 'fileNode.message.success.list',
			data,
		});
	}

	static TREE<T>(data?: T) {
		return new ResponseSuccess<T>({
			message: 'Get tree success',
			messageCode: 'fileNode.message.success.tree',
			data,
		});
	}
}

export class FileNodeException {
	static NOT_FOUND() {
		return new ResponseError({
			statusCode: 404,
			message: 'File node not found',
			messageCode: 'fileNode.message.error.notFound',
		});
	}

	static NAME_EXISTED() {
		return new ResponseError({
			message: 'File node name already existed in this folder',
			messageCode: 'fileNode.message.error.nameExisted',
		});
	}

	static PARENT_NOT_FOUND() {
		return new ResponseError({
			message: 'Parent not found',
			messageCode: 'fileNode.message.error.parentNotFound',
		});
	}

	static PARENT_MUST_BE_FOLDER() {
		return new ResponseError({
			message: 'Parent must be a folder',
			messageCode: 'fileNode.message.error.parentMustBeFolder',
		});
	}

	static INVALID_MOVE() {
		return new ResponseError({
			message: 'Cannot move node into itself/descendant',
			messageCode: 'fileNode.message.error.invalidMove',
		});
	}
}
