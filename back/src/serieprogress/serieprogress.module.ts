import {Module} from "@nestjs/common";
import {SerieprogressService} from "./serieprogress.service";
import {MongooseModule} from "@nestjs/mongoose";
import {SerieProgress, SerieProgressSchema} from "./schemas/serieprogress.schema";
import {SerieProgressController} from "./serieprogress.controller";
import {ContentAccessModule} from "../content-access/content-access.module";

@Module({
    imports:[
        MongooseModule.forFeature([
            {name: SerieProgress.name, schema: SerieProgressSchema}
        ]),
        ContentAccessModule
    ],
    controllers:[SerieProgressController],
    providers: [SerieprogressService],
    exports:[SerieprogressService]
})
export class SerieprogressModule {}
