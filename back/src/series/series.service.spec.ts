import {Model, Types} from "mongoose";
import {UsersService} from "../users/users.service";
import {SerieDocument} from "./schemas/series.schema";
import {SeriesService} from "./series.service";

describe("SeriesService mature classification", () => {
    it("persiste isMature mediante la actualización existente", async() => {
        const serieId = new Types.ObjectId();
        const findByIdAndUpdate = jest.fn().mockResolvedValue({isMature:true});
        const seriesModel = {
            findById:jest.fn().mockResolvedValue({variant:"manga"}),
            findByIdAndUpdate
        } as unknown as Model<SerieDocument>;
        const usersService = {} as UsersService;
        const service = new SeriesService(seriesModel, usersService);

        await service.editSerie(serieId, {isMature:true});

        expect(findByIdAndUpdate).toHaveBeenCalledWith(serieId, {isMature:true}, {new:true});
    });

    it("mantiene siempre isMature=true para doujinshi, también al restaurarlo", async() => {
        const create = jest.fn().mockResolvedValue({variant:"doujinshi", isMature:true});
        const findOne = jest.fn().mockResolvedValue(null);
        const seriesModel = {findOne, create} as unknown as Model<SerieDocument>;
        const service = new SeriesService(seriesModel, {} as UsersService);

        await service.updateOrCreate({path:"serie", visibleName:"serie", sortName:"serie", variant:"doujinshi"});

        expect(create).toHaveBeenCalledWith(expect.objectContaining({variant:"doujinshi", isMature:true}));
    });

    it("no permite desmarcar una serie doujinshi desde administración", async() => {
        const findByIdAndUpdate = jest.fn().mockResolvedValue({variant:"doujinshi", isMature:true});
        const seriesModel = {
            findById:jest.fn().mockResolvedValue({variant:"doujinshi"}),
            findByIdAndUpdate
        } as unknown as Model<SerieDocument>;
        const service = new SeriesService(seriesModel, {} as UsersService);

        await service.editSerie(new Types.ObjectId(), {isMature:false});

        expect(findByIdAndUpdate).toHaveBeenCalledWith(expect.any(Types.ObjectId), {isMature:true}, {new:true});
    });

    it("puede reparar doujinshi antiguos que no tuvieran la marca mature", async() => {
        const updateMany = jest.fn().mockResolvedValue({modifiedCount:1});
        const seriesModel = {updateMany} as unknown as Model<SerieDocument>;
        const service = new SeriesService(seriesModel, {} as UsersService);

        await service.ensureVariantMaturity("doujinshi");

        expect(updateMany).toHaveBeenCalledWith(
            {variant:"doujinshi", isMature:{$ne:true}},
            {$set:{isMature:true}}
        );
    });
});
