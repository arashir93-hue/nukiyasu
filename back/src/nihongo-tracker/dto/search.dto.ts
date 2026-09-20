import {IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min} from "class-validator";
import {Type} from "class-transformer";

export class SearchNihongoTrackerDto {
    @IsString()
    @IsNotEmpty()
    search: string;

    @IsIn(["manga", "light-novel"])
    type: "manga" | "light-novel";

    @IsInt()
    @Min(1)
    @IsOptional()
    @Type(() => Number)
    page?: number;

    @IsInt()
    @Min(1)
    @Max(50)
    @IsOptional()
    @Type(() => Number)
    perPage?: number;
}
