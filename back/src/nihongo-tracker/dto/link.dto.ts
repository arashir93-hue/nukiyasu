import {IsIn, IsOptional, IsString} from "class-validator";

export class LinkNihongoTrackerDto {
    @IsIn(["linked", "manual"])
    @IsOptional()
    mode?: "linked" | "manual";

    /** Kept for old clients; the backend derives and validates the real type. */
    @IsIn(["manga", "light-novel"])
    @IsOptional()
    mediaType?: "manga" | "light-novel";

    @IsString()
    @IsOptional()
    mediaId?: string;

    @IsString()
    @IsOptional()
    mediaTitle?: string;
}
