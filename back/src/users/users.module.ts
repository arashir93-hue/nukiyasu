import {Module, Global} from "@nestjs/common";
import {UsersService} from "./users.service";
import {MongooseModule} from "@nestjs/mongoose";
import {User, UserSchema} from "./schemas/user.schema";
import {UsersController} from "./users.controller";
import {TokensModule} from "../tokens/tokens.module";
import {DoujinshiFavorite, DoujinshiFavoriteSchema} from "../doujinshi-favorites/schemas/doujinshi-favorite.schema";
import {DoujinshiCollection, DoujinshiCollectionSchema} from "../doujinshi-favorites/schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItem, DoujinshiCollectionItemSchema} from "../doujinshi-favorites/schemas/doujinshi-collection-item.schema";
import {UserPersonalDataCleanupService} from "./user-personal-data-cleanup.service";

@Global()
@Module({
    imports: [
        MongooseModule.forFeature([
            {name: User.name, schema: UserSchema},
            {name: DoujinshiFavorite.name, schema: DoujinshiFavoriteSchema},
            {name: DoujinshiCollection.name, schema: DoujinshiCollectionSchema},
            {name: DoujinshiCollectionItem.name, schema: DoujinshiCollectionItemSchema}
        ]),
        TokensModule
    ],
    providers: [UsersService, UserPersonalDataCleanupService],
    exports: [UsersService],
    controllers: [UsersController]
})
export class UsersModule {}
