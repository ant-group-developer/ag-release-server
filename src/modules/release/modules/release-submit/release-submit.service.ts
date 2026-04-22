// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { ReleaseSubmit, ReleaseSubmitStatus } from './release-submit.entity';

// @Injectable()
// export class ReleaseSubmitService {
// 	constructor(
// 		@InjectRepository(ReleaseSubmit)
// 		private readonly releaseSubmitRepo: Repository<ReleaseSubmit>,
// 	) {}

// 	async new(data: Partial<ReleaseSubmit>) {
// 		const entity = this.releaseSubmitRepo.create(data);
// 		return this.releaseSubmitRepo.save(entity);
// 	}

// 	async processing(id: string) {
// 		const entity = await this.findOne(id);
// 		entity.status = ReleaseSubmitStatus.PROCESSING;
// 		return this.releaseSubmitRepo.save(entity);
// 	}

// 	async processing2(id:string){
// 		// 
// 		const entity = await this.findOne(id);
		

// 		if(!entity.metadata.input.releaseSnapshot.upc){
// 			new job genUpc {
// 				id: 'string',
// 				release_submit_id: 'string',
// 				step_type: {
// 					id: string,
// 					type: 'genUpc',
// 					metadata: {
// 						input: {
// 							prefixUpcId: string,
// 						},
// 					output: upc,
// 				}
// 			}
// 		}
// 	}
// 		if(entity.metadata.input.releaseSnapshot.tracks.some(track => !track.isrc)){
// 			new job genIsrcs {
// 				id: 'string',
// 				release_submit_id: 'string',
// 				step_type: {
// 					id: 'string',
// 					type: 'genIsrcs',
// 					metadata: {
// 						input: {
// 							trackIds: 'string',
// 						},
// 						output: [isrc],
// 					},
// 					steps: tracks.map => [
// 						{
// 							type: 'genIsrc',
// 							metadata:{

// 								input: {
// 									trackId: 'string',
// 								},
// 								output: isrc,
// 							}
// 						}
// 					]
// 				}
// 			}
// 		}

// 		if(!entity.metadata.input.releaseSnapshot.upc){
// 			new job genUpc
// 		}
// 	}

// 	async waitingAction(id: string) {
// 		const entity = await this.findOne(id);
		
// 	}

// 	async done(id: string) {
		
// 	}

// 	async failed(data: Partial<ReleaseSubmit>) {
		
// 	}
	

// 	async findOne(id: string) {
// 		const entity = await this.releaseSubmitRepo.findOne({ where: { id } });
// 		if (!entity) {
// 			throw new NotFoundException('Release submit not found');
// 		}
// 		return entity;
// 	}
// }
