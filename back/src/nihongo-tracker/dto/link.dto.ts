import {IsIn, IsNotEmpty, IsOptional, IsString} from "class-validator";

export class LinkNihongoTrackerDto {
    @IsIn(["manga", "light-novel"])
    mediaType: "manga" | "light-novel";

    @IsString()
    @IsNotEmpty()
    mediaId: string;

    @IsString()
    @IsOptional()
    mediaTitle?: string;
}
