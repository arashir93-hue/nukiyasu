import {ConflictException, NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {SerieDocument} from "../series/schemas/series.schema";
import {CreateDoujinshiCollectionDto} from "./dto/create-doujinshi-collection.dto";
import {UpdateDoujinshiCollectionDto} from "./dto/update-doujinshi-collection.dto";
import {DoujinshiCollectionsService} from "./doujinshi-collections.service";
import {DoujinshiCollectionDocument} from "./schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItemDocument} from "./schemas/doujinshi-collection-item.schema";

describe("DoujinshiCollectionsService", () => {
    const userA = new Types.ObjectId();
    const collectionId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const matureId = new Types.ObjectId();
    const missingId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{missing:{$ne:true}, isMature:{$ne:true}}
    };
    const allPolicy:ContentAccessPolicy = {
        showMatureContent:true,
        seriesMatch:{missing:{$ne:true}}
    };
    let collectionModel: {
        create:jest.Mock;
        findOne:jest.Mock;
        findOneAndUpdate:jest.Mock;
        deleteOne:jest.Mock;
        aggregate:jest.Mock;
    };
    let itemModel: {
        findOne:jest.Mock;
        findOneAndUpdate:jest.Mock;
        deleteOne:jest.Mock;
        deleteMany:jest.Mock;
        aggregate:jest.Mock;
    };
    let seriesModel: {exists:jest.Mock};
    let contentAccessService: {forJoinedSeries:jest.Mock};
    let service:DoujinshiCollectionsService;

    beforeEach(() => {
        collectionModel = {
            create:jest.fn().mockResolvedValue({
                _id:collectionId,
                name:"Comedia",
                normalizedName:"comedia"
            }),
            findOne:jest.fn().mockResolvedValue({_id:collectionId, user:userA}),
            findOneAndUpdate:jest.fn().mockResolvedValue({_id:collectionId}),
            deleteOne:jest.fn().mockResolvedValue({deletedCount:1}),
            aggregate:jest.fn()
        };
        itemModel = {
            findOne:jest.fn().mockResolvedValue({_id:new Types.ObjectId()}),
            findOneAndUpdate:jest.fn().mockResolvedValue({_id:new Types.ObjectId()}),
            deleteOne:jest.fn().mockResolvedValue({deletedCount:1}),
            deleteMany:jest.fn().mockResolvedValue({deletedCount:1}),
            aggregate:jest.fn()
        };
        seriesModel = {exists:jest.fn().mockResolvedValue({_id:serieId})};
        contentAccessService = {
            forJoinedSeries:jest.fn((alias:string, currentPolicy:ContentAccessPolicy) =>
                Object.fromEntries(Object.entries(currentPolicy.seriesMatch).map(([key, value]) => [`${alias}.${key}`, value]))
            )
        };
        service = new DoujinshiCollectionsService(
            collectionModel as unknown as Model<DoujinshiCollectionDocument>,
            itemModel as unknown as Model<DoujinshiCollectionItemDocument>,
            seriesModel as unknown as Model<SerieDocument>,
            contentAccessService as unknown as ContentAccessService
        );
    });

    it("crea una colección con nombre visible trim y normalizedName backend-only", async() => {
        const dto = {name:"  ComÉdia  "} as CreateDoujinshiCollectionDto;

        await service.createCollection(userA, dto);

        expect(collectionModel.create).toHaveBeenCalledWith({
            user:userA,
            name:"ComÉdia",
            normalizedName:"comédia",
            isFavorite:false,
            sortOrder:0
        });
    });

    it("normaliza NFKC sin cambiar el nombre japonés visible", async() => {
        await service.createCollection(userA, {name:"  ＡＢＣ 漫画  "} as CreateDoujinshiCollectionDto);

        expect(collectionModel.create).toHaveBeenCalledWith(expect.objectContaining({
            name:"ＡＢＣ 漫画",
            normalizedName:"abc 漫画"
        }));
    });

    it("convierte duplicados de nombre en conflicto", async() => {
        collectionModel.create.mockRejectedValueOnce({code:11000});

        await expect(service.createCollection(userA, {name:"COMEDIA"} as CreateDoujinshiCollectionDto))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it("lista colecciones ordenadas y cuenta solo elementos visibles", async() => {
        collectionModel.aggregate.mockResolvedValueOnce([
            {_id:collectionId, name:"Comedia", visibleItemCount:1},
            {_id:new Types.ObjectId(), name:"Drama", visibleItemCount:0}
        ]);

        await expect(service.listCollections(userA, policy)).resolves.toEqual([
            {_id:collectionId, name:"Comedia", visibleItemCount:1},
            expect.objectContaining({name:"Drama", visibleItemCount:0})
        ]);

        const pipeline = collectionModel.aggregate.mock.calls[0][0];
        expect(pipeline).toContainEqual({$match:{user:userA}});
        expect(pipeline).toContainEqual({$sort:{isFavorite:-1, sortOrder:1, createdAt:1, _id:1}});
        expect(JSON.stringify(pipeline)).toContain("$count");
        expect(JSON.stringify(pipeline)).toContain("serieInfo.isMature");
    });

    it("actualiza solo campos permitidos de la colección propia", async() => {
        const dto:UpdateDoujinshiCollectionDto = {
            name:"  Nuevas  ",
            isFavorite:true,
            sortOrder:4
        };

        await service.updateCollection(userA, collectionId, dto);

        expect(collectionModel.findOneAndUpdate).toHaveBeenCalledWith(
            {_id:collectionId, user:userA},
            {$set:expect.objectContaining({
                name:"Nuevas",
                normalizedName:"nuevas",
                isFavorite:true,
                sortOrder:4,
                updatedAt:expect.any(Date)
            })},
            {new:true}
        );
    });

    it("devuelve conflicto al renombrar contra un nombre normalizado existente", async() => {
        collectionModel.findOneAndUpdate.mockRejectedValueOnce({code:11000});

        await expect(service.updateCollection(userA, collectionId, {name:" COMEDIA "}))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it("rechaza sortOrder fuera del rango entero", async() => {
        await expect(service.updateCollection(userA, collectionId, {sortOrder:1.5}))
            .rejects.toThrow("sortOrder");
        expect(collectionModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("protege una colección ajena", async() => {
        collectionModel.findOne.mockResolvedValue(null);

        await expect(service.updateCollection(userA, collectionId, {name:"X"}))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(service.deleteCollection(userA, collectionId))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(service.addItem(userA, collectionId, serieId, policy))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(service.removeItem(userA, collectionId, serieId))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it("borra los elementos antes que la colección", async() => {
        const order:string[] = [];
        itemModel.deleteMany.mockImplementation(async() => { order.push("items"); return {deletedCount:1}; });
        collectionModel.deleteOne.mockImplementation(async() => { order.push("collection"); return {deletedCount:1}; });

        await service.deleteCollection(userA, collectionId);

        expect(order).toEqual(["items", "collection"]);
        expect(itemModel.deleteMany).toHaveBeenCalledWith({user:userA, collection:collectionId});
        expect(collectionModel.deleteOne).toHaveBeenCalledWith({_id:collectionId, user:userA});
    });

    it("añade solo doujinshi accesibles e idempotentes", async() => {
        await expect(service.addItem(userA, collectionId, serieId, policy))
            .resolves.toEqual({isInCollection:true});
        await service.addItem(userA, collectionId, serieId, policy);

        expect(itemModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(seriesModel.exists).toHaveBeenCalledWith({
            _id:serieId,
            variant:"doujinshi",
            ...policy.seriesMatch
        });
    });

    it.each([matureId, missingId])("rechaza contenido no accesible: %s", async(id) => {
        seriesModel.exists.mockResolvedValueOnce(null);
        await expect(service.addItem(userA, collectionId, id, policy))
            .rejects.toBeInstanceOf(NotFoundException);
        expect(itemModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("permite contenido maduro al activarlo y trata la carrera única como éxito", async() => {
        seriesModel.exists.mockResolvedValue({_id:matureId});
        itemModel.findOneAndUpdate.mockRejectedValueOnce({code:11000});

        await expect(service.addItem(userA, collectionId, matureId, allPolicy))
            .resolves.toEqual({isInCollection:true});
    });

    it("elimina elementos de forma idempotente sin comprobar acceso de la serie", async() => {
        await expect(service.removeItem(userA, collectionId, matureId))
            .resolves.toEqual({isInCollection:false});
        await expect(service.removeItem(userA, collectionId, matureId))
            .resolves.toEqual({isInCollection:false});

        expect(itemModel.deleteOne).toHaveBeenCalledTimes(2);
        expect(seriesModel.exists).not.toHaveBeenCalled();
    });

    it("pagina items después de aplicar el acceso", async() => {
        itemModel.aggregate
            .mockResolvedValueOnce([{total:3}])
            .mockResolvedValueOnce([{_id:serieId, variant:"doujinshi"}]);

        await expect(service.listItems(userA, collectionId, policy, 2, 2)).resolves.toEqual({
            data:[{_id:serieId, variant:"doujinshi"}],
            pages:2
        });
        expect(itemModel.aggregate.mock.calls[0][0]).toContainEqual({$match:{
            "serieInfo.missing":{$ne:true},
            "serieInfo.isMature":{$ne:true},
            "serieInfo.variant":"doujinshi"
        }});
        expect(itemModel.aggregate.mock.calls[1][0]).toContainEqual({$skip:2});
        expect(itemModel.aggregate.mock.calls[1][0]).toContainEqual(expect.objectContaining({$lookup:expect.objectContaining({from:"books"})}));
        expect(JSON.stringify(itemModel.aggregate.mock.calls[1][0])).toContain("thumbnailPath");
    });

    it("batch devuelve únicamente colecciones propias y visibles, sin N+1", async() => {
        itemModel.aggregate.mockResolvedValueOnce([
            {serie:serieId, collection:collectionId},
            {serie:serieId, collection:collectionId}
        ]);

        const result = await service.batchCollectionStatus(userA, [serieId, serieId, matureId], policy);

        expect(result).toEqual({
            [serieId.toString()]:{collectionIds:[collectionId.toString()]},
            [matureId.toString()]:{collectionIds:[]}
        });
        expect(itemModel.aggregate).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(itemModel.aggregate.mock.calls[0][0])).toContain("collectionInfo.user");
        expect(JSON.stringify(itemModel.aggregate.mock.calls[0][0])).toContain("serieInfo.isMature");
    });
});
