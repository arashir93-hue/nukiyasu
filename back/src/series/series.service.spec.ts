import {Model, Types} from "mongoose";
import {UsersService} from "../users/users.service";
import {SerieDocument} from "./schemas/series.schema";
import {SeriesService} from "./series.service";

describe("SeriesService mature classification", () => {
    it("persiste isMature mediante la actualización existente", async() => {
        const serieId = new Types.ObjectId();
        const findByIdAndUpdate = jest.fn().mockResolvedValue({isMature:true});
        const seriesModel = {findByIdAndUpdate} as unknown as Model<SerieDocument>;
        const usersService = {} as UsersService;
        const service = new SeriesService(seriesModel, usersService);

        await service.editSerie(serieId, {isMature:true});

        expect(findByIdAndUpdate).toHaveBeenCalledWith(serieId, {isMature:true});
    });
});
