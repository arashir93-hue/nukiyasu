import {Type} from "class-transformer";
import {IsNumber, IsOptional, Min} from "class-validator";

export class FavoriteListQueryDto {
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    page?: number;

    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @IsOptional()
    limit?: number;
}
