import {Type} from "class-transformer";
import {IsNumber, IsOptional, IsPositive} from "class-validator";

export class LogNihongoTrackerBookDto {
    @Type(() => Number)
    @IsNumber()
    @IsPositive()
    @IsOptional()
    volumeNumber?: number;
}
