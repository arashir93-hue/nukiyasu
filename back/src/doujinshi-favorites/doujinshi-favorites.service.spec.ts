import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {DoujinshiFavoriteDocument} from "./schemas/doujinshi-favorite.schema";
import {SerieDocument} from "../series/schemas/series.schema";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";

describe("DoujinshiFavoritesService", () => {
    const userA = new Types.ObjectId();
    const normalDoujinshi = new Types.ObjectId();
    const matureDoujinshi = new Types.ObjectId();
    const manga = new Types.ObjectId();
    const missingDoujinshi = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{missing:{$ne:true}, isMature:{$ne:true}}
    };
    const allPolicy:ContentAccessPolicy = {
        showMatureContent:true,
        seriesMatch:{missing:{$ne:true}}
    };
    let favoriteModel: {
        findOneAndUpdate:jest.Mock;
        deleteOne:jest.Mock;
        aggregate:jest.Mock;
        find:jest.Mock;
    };
    let seriesModel: {
        exists:jest.Mock;
        find:jest.Mock;
    };
    let contentAccessService: {forJoinedSeries:jest.Mock};
    let service:DoujinshiFavoritesService;

    beforeEach(() => {
        favoriteModel = {
            findOneAndUpdate:jest.fn().mockResolvedValue({}),
            deleteOne:jest.fn().mockResolvedValue({deletedCount:1}),
            aggregate:jest.fn(),
            find:jest.fn()
        };
        seriesModel = {
            exists:jest.fn().mockResolvedValue({_id:normalDoujinshi}),
            find:jest.fn()
        };
        contentAccessService = {
            forJoinedSeries:jest.fn((alias:string, currentPolicy:ContentAccessPolicy) =>
                Object.fromEntries(Object.entries(currentPolicy.seriesMatch).map(([key, value]) => [`${alias}.${key}`, value]))
            )
        };
        service = new DoujinshiFavoritesService(
            favoriteModel as unknown as Model<DoujinshiFavoriteDocument>,
            seriesModel as unknown as Model<SerieDocument>,
            contentAccessService as unknown as ContentAccessService
        );
    });

    it("crea el favorito usando el usuario autenticado y la serie doujinshi", async() => {
        await expect(service.addFavorite(userA, normalDoujinshi, policy)).resolves.toEqual({isFavorite:true});

        expect(seriesModel.exists).toHaveBeenCalledWith({
            _id:normalDoujinshi,
            variant:"doujinshi",
            ...policy.seriesMatch
        });
        expect(favoriteModel.findOneAndUpdate).toHaveBeenCalledWith(
            {user:userA, serie:normalDoujinshi},
            {$setOnInsert:{user:userA, serie:normalDoujinshi}},
            {upsert:true, new:true, setDefaultsOnInsert:true}
        );
    });

    it("mantiene el favorito al consultarlo después de guardarlo", async() => {
        const savedFavorites: Array<{user:Types.ObjectId; serie:Types.ObjectId}> = [];
        favoriteModel.findOneAndUpdate.mockImplementation(async(filter:{user:Types.ObjectId; serie:Types.ObjectId}) => {
            if (!savedFavorites.some(item => item.user.equals(filter.user) && item.serie.equals(filter.serie))) {
                savedFavorites.push(filter);
            }
            return savedFavorites[savedFavorites.length - 1];
        });
        seriesModel.find.mockResolvedValue([{_id:normalDoujinshi}]);
        favoriteModel.find.mockImplementation(async() => savedFavorites.map(item => ({serie:item.serie})));

        await service.addFavorite(userA, normalDoujinshi, policy);
        const status = await service.batchStatus(userA, [normalDoujinshi], policy);

        favoriteModel.aggregate
            .mockResolvedValueOnce([{total:1}])
            .mockResolvedValueOnce([{_id:normalDoujinshi, variant:"doujinshi", thumbnailPath:"Serie/v01/001.jpg"}]);
        const listed = await service.listFavorites(userA, policy);

        expect(status[normalDoujinshi.toString()]).toEqual({isFavorite:true});
        expect(listed.data).toEqual([{_id:normalDoujinshi, variant:"doujinshi", thumbnailPath:"Serie/v01/001.jpg"}]);
        expect(savedFavorites).toHaveLength(1);
        expect(savedFavorites[0]).toEqual({user:userA, serie:normalDoujinshi});
    });

    it("no acepta series no doujinshi, inexistentes, missing u ocultas", async() => {
        for (const id of [manga, missingDoujinshi, matureDoujinshi]) {
            seriesModel.exists.mockResolvedValueOnce(null);
            await expect(service.addFavorite(userA, id, policy)).rejects.toBeInstanceOf(NotFoundException);
        }

        expect(favoriteModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("permite una serie madura cuando la preferencia está activa", async() => {
        seriesModel.exists.mockResolvedValue({_id:matureDoujinshi});

        await expect(service.addFavorite(userA, matureDoujinshi, allPolicy)).resolves.toEqual({isFavorite:true});
    });

    it("es idempotente al repetir PUT y no crea documentos duplicados", async() => {
        await service.addFavorite(userA, normalDoujinshi, policy);
        await service.addFavorite(userA, normalDoujinshi, policy);

        expect(favoriteModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(favoriteModel.findOneAndUpdate).toHaveBeenCalledWith(
            {user:userA, serie:normalDoujinshi},
            {$setOnInsert:{user:userA, serie:normalDoujinshi}},
            expect.objectContaining({upsert:true})
        );
    });

    it("trata una carrera de índice único como un PUT ya aplicado", async() => {
        favoriteModel.findOneAndUpdate.mockRejectedValueOnce({code:11000});

        await expect(service.addFavorite(userA, normalDoujinshi, policy)).resolves.toEqual({isFavorite:true});
    });

    it("es idempotente al repetir DELETE y permite retirar favoritos ocultos", async() => {
        await expect(service.removeFavorite(userA, matureDoujinshi)).resolves.toEqual({isFavorite:false});
        await expect(service.removeFavorite(userA, matureDoujinshi)).resolves.toEqual({isFavorite:false});

        expect(favoriteModel.deleteOne).toHaveBeenNthCalledWith(1, {user:userA, serie:matureDoujinshi});
        expect(favoriteModel.deleteOne).toHaveBeenNthCalledWith(2, {user:userA, serie:matureDoujinshi});
    });

    it("lista únicamente favoritos doujinshi accesibles y pagina antes de devolverlos", async() => {
        favoriteModel.aggregate
            .mockResolvedValueOnce([{total:3}])
            .mockResolvedValueOnce([{_id:normalDoujinshi, variant:"doujinshi"}]);

        const result = await service.listFavorites(userA, policy, 2, 2);

        expect(result).toEqual({
            data:[{_id:normalDoujinshi, variant:"doujinshi"}],
            pages:2
        });
        expect(favoriteModel.aggregate).toHaveBeenCalledTimes(2);
        const countPipeline = favoriteModel.aggregate.mock.calls[0][0];
        expect(countPipeline).toContainEqual({$match:{
            "serieInfo.missing":{$ne:true},
            "serieInfo.isMature":{$ne:true},
            "serieInfo.variant":"doujinshi"
        }});
        expect(favoriteModel.aggregate.mock.calls[1][0]).toContainEqual({$skip:2});
        expect(favoriteModel.aggregate.mock.calls[1][0]).toContainEqual(expect.objectContaining({$lookup:expect.objectContaining({from:"books"})}));
        expect(JSON.stringify(favoriteModel.aggregate.mock.calls[1][0])).toContain("thumbnailPath");
        expect(favoriteModel.aggregate.mock.calls[1][0]).toContainEqual({$limit:2});
    });

    it("no borra favoritos ocultos: dejan de aparecer y reaparecen al reactivar la preferencia", async() => {
        favoriteModel.aggregate
            .mockResolvedValueOnce([{total:0}])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{total:1}])
            .mockResolvedValueOnce([{_id:matureDoujinshi, variant:"doujinshi"}]);

        await expect(service.listFavorites(userA, policy)).resolves.toEqual({data:[], pages:0});
        await expect(service.listFavorites(userA, allPolicy)).resolves.toEqual({
            data:[{_id:matureDoujinshi, variant:"doujinshi"}],
            pages:1
        });
        expect(favoriteModel.deleteOne).not.toHaveBeenCalled();
    });

    it("resuelve el estado batch con consultas agrupadas, deduplicando IDs", async() => {
        seriesModel.find.mockResolvedValue([
            {_id:normalDoujinshi},
            {_id:manga}
        ]);
        favoriteModel.find.mockResolvedValue([{serie:normalDoujinshi}]);

        const result = await service.batchStatus(
            userA,
            [normalDoujinshi, normalDoujinshi, matureDoujinshi, manga],
            policy
        );

        expect(result).toEqual({
            [normalDoujinshi.toString()]:{isFavorite:true},
            [matureDoujinshi.toString()]:{isFavorite:false},
            [manga.toString()]:{isFavorite:false}
        });
        expect(seriesModel.find).toHaveBeenCalledTimes(1);
        expect(favoriteModel.find).toHaveBeenCalledTimes(1);
        expect(seriesModel.exists).not.toHaveBeenCalled();
        expect(seriesModel.find.mock.calls[0][0]).toEqual(expect.objectContaining({
            _id:{$in:[normalDoujinshi, matureDoujinshi, manga]},
            variant:"doujinshi",
            ...policy.seriesMatch
        }));
    });

    it("filtra los favoritos por el usuario autenticado", async() => {
        seriesModel.find.mockResolvedValue([{_id:normalDoujinshi}]);
        favoriteModel.find.mockResolvedValue([]);

        const result = await service.batchStatus(userA, [normalDoujinshi], policy);

        expect(result[normalDoujinshi.toString()]).toEqual({isFavorite:false});
        expect(favoriteModel.find).toHaveBeenCalledWith(
            {user:userA, serie:{$in:[normalDoujinshi]}},
            {serie:1}
        );
    });
});
