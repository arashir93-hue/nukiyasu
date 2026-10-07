import {Injectable} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Model, Types} from "mongoose";
import {DoujinshiCollection, DoujinshiCollectionDocument} from "../doujinshi-favorites/schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItem, DoujinshiCollectionItemDocument} from "../doujinshi-favorites/schemas/doujinshi-collection-item.schema";
import {DoujinshiFavorite, DoujinshiFavoriteDocument} from "../doujinshi-favorites/schemas/doujinshi-favorite.schema";

@Injectable()
export class UserPersonalDataCleanupService {
    constructor(
        @InjectModel(DoujinshiCollectionItem.name)
        private readonly collectionItemModel: Model<DoujinshiCollectionItemDocument>,
        @InjectModel(DoujinshiCollection.name)
        private readonly collectionModel: Model<DoujinshiCollectionDocument>,
        @InjectModel(DoujinshiFavorite.name)
        private readonly favoriteModel: Model<DoujinshiFavoriteDocument>
    ) {}

    async cleanup(userId: Types.ObjectId): Promise<void> {
        await this.collectionItemModel.deleteMany({user: userId});
        await this.collectionModel.deleteMany({user: userId});
        await this.favoriteModel.deleteMany({user: userId});
    }
}
