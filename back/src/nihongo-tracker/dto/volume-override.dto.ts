import {Type} from "class-transformer";
import {IsNumber, IsPositive} from "class-validator";

export class VolumeOverrideDto {
    @Type(() => Number)
    @IsNumber()
    @IsPositive()
    volumeNumber: number;
}
