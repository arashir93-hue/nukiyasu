import {Module} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {Serie, SerieSchema} from "../series/schemas/series.schema";
import {UsersModule} from "../users/users.module";
import {ContentAccessService} from "./content-access.service";

@Module({
    imports:[
        UsersModule,
        MongooseModule.forFeature([{name:Serie.name, schema:SerieSchema}])
    ],
    providers:[ContentAccessService],
    exports:[ContentAccessService]
})
export class ContentAccessModule {}
