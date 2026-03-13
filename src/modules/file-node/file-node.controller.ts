// src/modules/file-node/file-node.controller.ts
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserId } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { FileNodeSuccess } from './const/file-node.const';
import {
	CreateFileNodeDto,
	GetListFileNodesDto,
	MoveFileNodeDto,
	UpdateFileNodeDto,
} from './dto/create-file-node.dto';
import { FileNode } from './entities/file-node.entity';
import { FileNodeService } from './services/file-node.service';

@ApiTags('File Nodes')
@Controller('file-nodes')
export class FileNodeController {
	constructor(private readonly svc: FileNodeService) {}

	@Post()
	@ApiOperation({ summary: 'Create file node' })
	async create(
		@Body() data: CreateFileNodeDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<FileNode>> {
		const result = await this.svc.create({ data, userId: user.id });
		return FileNodeSuccess.CREATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update file node' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: FileNode })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateFileNodeDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<FileNode>> {
		const result = await this.svc.update({ id, data, userId });
		return FileNodeSuccess.UPDATE(result);
	}

	@Put(':id/move')
	@ApiOperation({ summary: 'Move file node' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: FileNode })
	async move(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: MoveFileNodeDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<FileNode>> {
		const result = await this.svc.move({ id, data, userId });
		return FileNodeSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete file node' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<{ id: string }>> {
		const result = await this.svc.delete({ id });
		return FileNodeSuccess.DELETE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get file node detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: FileNode })
	async detail(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<FileNode>> {
		const result = await this.svc.getDetail({ id });
		return FileNodeSuccess.DETAIL(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list file nodes' })
	async list(
		@Query() filter: GetListFileNodesDto,
	): Promise<ResponseSuccess<any>> {
		const result = await this.svc.getList(filter);
		return FileNodeSuccess.LIST(result);
	}

	@Get('tree/root')
	@ApiOperation({ summary: 'Get file node tree (all roots)' })
	async treeAll(): Promise<ResponseSuccess<any>> {
		const result = await this.svc.getTree();
		return FileNodeSuccess.TREE(result);
	}

	@Get('tree/:rootId')
	@ApiOperation({ summary: 'Get file node tree by rootId' })
	@ApiParam({ name: 'rootId', format: 'uuid' })
	async treeByRoot(
		@Param('rootId', ParseUUIDPipe) rootId: string,
	): Promise<ResponseSuccess<any>> {
		const result = await this.svc.getTree(rootId);
		return FileNodeSuccess.TREE(result);
	}
}
