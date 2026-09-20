import {IsNotEmpty, IsString, MinLength} from "class-validator";

export class ConnectNihongoTrackerDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    apiKey: string;
}
