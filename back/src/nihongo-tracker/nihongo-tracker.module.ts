import {Module} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {ContentAccessModule} from "../content-access/content-access.module";
import {Book, BookSchema} from "../books/schemas/book.schema";
import {ReadProgress, ReadProgressSchema} from "../readprogress/schemas/readprogress.schema";
import {Serie, SerieSchema} from "../series/schemas/series.schema";
import {NihongoTrackerController} from "./nihongo-tracker.controller";
import {NihongoTrackerService} from "./nihongo-tracker.service";
import {NihongoTrackerIntegration, NihongoTrackerIntegrationSchema} from "./schemas/integration.schema";
import {NihongoTrackerLink, NihongoTrackerLinkSchema} from "./schemas/link.schema";
import {NihongoTrackerLog, NihongoTrackerLogSchema} from "./schemas/log.schema";
import {NihongoTrackerBookOverride, NihongoTrackerBookOverrideSchema} from "./schemas/book-override.schema";

@Module({
    imports:[
        MongooseModule.forFeature([
            {name:NihongoTrackerIntegration.name, schema:NihongoTrackerIntegrationSchema},
            {name:NihongoTrackerLink.name, schema:NihongoTrackerLinkSchema},
            {name:NihongoTrackerLog.name, schema:NihongoTrackerLogSchema},
            {name:NihongoTrackerBookOverride.name, schema:NihongoTrackerBookOverrideSchema},
            {name:Serie.name, schema:SerieSchema},
            {name:Book.name, schema:BookSchema},
            {name:ReadProgress.name, schema:ReadProgressSchema}
        ]),
        ContentAccessModule
    ],
    controllers:[NihongoTrackerController],
    providers:[NihongoTrackerService]
})
export class NihongoTrackerModule {}
