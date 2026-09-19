import {Module} from "@nestjs/common";
import {ReviewsService} from "./reviews.service";
import {ReviewsController} from "./reviews.controller";
import {MongooseModule} from "@nestjs/mongoose";
import {Review, ReviewSchema} from "./schemas/review.schema";
import {SeriesModule} from "../series/series.module";
import {ContentAccessModule} from "../content-access/content-access.module";

@Module({
    imports:[
        MongooseModule.forFeature([{name: Review.name, schema: ReviewSchema}]),
        SeriesModule,
        ContentAccessModule
    ],
    controllers: [ReviewsController],
    providers: [ReviewsService]
})
export class ReviewsModule {}
