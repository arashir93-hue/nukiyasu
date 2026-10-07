import {Module} from "@nestjs/common";
import {MongooseModule} from "@nestjs/mongoose";
import {ContentAccessModule} from "../content-access/content-access.module";
import {Serie, SerieSchema} from "../series/schemas/series.schema";
import {DoujinshiFavoritesController} from "./doujinshi-favorites.controller";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";
import {DoujinshiCollectionsService} from "./doujinshi-collections.service";
import {DoujinshiCollection, DoujinshiCollectionSchema} from "./schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItem, DoujinshiCollectionItemSchema} from "./schemas/doujinshi-collection-item.schema";
import {DoujinshiFavorite, DoujinshiFavoriteSchema} from "./schemas/doujinshi-favorite.schema";

@Module({
    imports: [
        MongooseModule.forFeature([
            {name: DoujinshiFavorite.name, schema: DoujinshiFavoriteSchema},
            {name: Serie.name, schema: SerieSchema},
            {name: DoujinshiCollection.name, schema: DoujinshiCollectionSchema},
            {name: DoujinshiCollectionItem.name, schema: DoujinshiCollectionItemSchema}
        ]),
        ContentAccessModule
    ],
    controllers: [DoujinshiFavoritesController],
    providers: [DoujinshiFavoritesService, DoujinshiCollectionsService],
    exports: [DoujinshiFavoritesService, DoujinshiCollectionsService]
})
export class DoujinshiFavoritesModule {}
