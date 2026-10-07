import {Model, Types} from "mongoose";
import {UserPersonalDataCleanupService} from "./user-personal-data-cleanup.service";
import {DoujinshiFavoriteDocument} from "../doujinshi-favorites/schemas/doujinshi-favorite.schema";
import {DoujinshiCollectionDocument} from "../doujinshi-favorites/schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItemDocument} from "../doujinshi-favorites/schemas/doujinshi-collection-item.schema";

describe("UserPersonalDataCleanupService", () => {
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();

    it("elimina solo las relaciones del usuario solicitado en el orden definido", async() => {
        const order:string[] = [];
        const collectionItemModel = {
            deleteMany:jest.fn(async(query) => { order.push("items"); return query; })
        };
        const collectionModel = {
            deleteMany:jest.fn(async(query) => { order.push("collections"); return query; })
        };
        const favoriteModel = {
            deleteMany:jest.fn(async(query) => { order.push("favorites"); return query; })
        };
        const service = new UserPersonalDataCleanupService(
            collectionItemModel as unknown as Model<DoujinshiCollectionItemDocument>,
            collectionModel as unknown as Model<DoujinshiCollectionDocument>,
            favoriteModel as unknown as Model<DoujinshiFavoriteDocument>
        );

        await service.cleanup(userA);

        expect(order).toEqual(["items", "collections", "favorites"]);
        expect(collectionItemModel.deleteMany).toHaveBeenCalledWith({user:userA});
        expect(collectionModel.deleteMany).toHaveBeenCalledWith({user:userA});
        expect(favoriteModel.deleteMany).toHaveBeenCalledWith({user:userA});
        expect(collectionItemModel.deleteMany).not.toHaveBeenCalledWith({user:userB});
        expect(collectionModel.deleteMany).not.toHaveBeenCalledWith({user:userB});
        expect(favoriteModel.deleteMany).not.toHaveBeenCalledWith({user:userB});
    });

    it("es idempotente cuando no hay datos personales", async() => {
        const emptyModel = {deleteMany:jest.fn().mockResolvedValue({deletedCount:0})};
        const service = new UserPersonalDataCleanupService(
            emptyModel as unknown as Model<DoujinshiCollectionItemDocument>,
            emptyModel as unknown as Model<DoujinshiCollectionDocument>,
            emptyModel as unknown as Model<DoujinshiFavoriteDocument>
        );

        await expect(service.cleanup(userA)).resolves.toBeUndefined();
        await expect(service.cleanup(userA)).resolves.toBeUndefined();
        expect(emptyModel.deleteMany).toHaveBeenCalledTimes(6);
    });
});
