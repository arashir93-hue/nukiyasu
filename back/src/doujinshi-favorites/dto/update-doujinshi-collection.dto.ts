import {Transform} from "class-transformer";
import {IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min} from "class-validator";

export class UpdateDoujinshiCollectionDto {
    @Transform(({value}) => typeof value === "string" ? value.trim() : value)
    @IsString()
    @Length(1, 80)
    @IsOptional()
    name?: string;

    @IsBoolean()
    @IsOptional()
    isFavorite?: boolean;

    @IsInt()
    @Min(0)
    @Max(1000000)
    @IsOptional()
    sortOrder?: number;
}
