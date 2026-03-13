import { PartialType } from '@nestjs/mapped-types';
import { CreateReleaseDspDeliveryLogDto } from './create-release-dsp-delivery-log.dto';

export class UpdateReleaseDspDeliveryLogDto extends PartialType(CreateReleaseDspDeliveryLogDto) {}
