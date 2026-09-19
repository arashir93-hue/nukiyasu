import {IsBoolean} from "class-validator";

export class UpdateMatureContentPreferenceDto {
    @IsBoolean()
    showMatureContent:boolean;
}
