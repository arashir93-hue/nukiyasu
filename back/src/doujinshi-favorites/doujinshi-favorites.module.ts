import {Module} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {ContentAccessModule} from "../content-access/content-access.module";
import {Serie, SerieSchema} from "../series/schemas/series.schema";
import {DoujinshiFavoritesController} from "./doujinshi-favorites.controller";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";
import {DoujinshiFavorite, DoujinshiFavoriteSchema} from "./schemas/doujinshi-favorite.schema";

@Module({
    imports: [
        MongooseModule.forFeature([
            {name: DoujinshiFavorite.name, schema: DoujinshiFavoriteSchema},
            {name: Serie.name, schema: SerieSchema}
        ]),
        ContentAccessModule
    ],
    controllers: [DoujinshiFavoritesController],
    providers: [DoujinshiFavoritesService],
    exports: [DoujinshiFavoritesService]
})
export class DoujinshiFavoritesModule {}
