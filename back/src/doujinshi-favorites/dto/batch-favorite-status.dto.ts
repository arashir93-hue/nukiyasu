import {ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId} from "class-validator";

export class BatchFavoriteStatusDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @IsMongoId({each: true})
    serieIds: string[];
}
