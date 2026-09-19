import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {SerieDocument} from "../series/schemas/series.schema";
import {UsersService} from "../users/users.service";
import {ContentAccessService} from "./content-access.service";

describe("ContentAccessService", () => {
    const normalId = new Types.ObjectId();
    const matureId = new Types.ObjectId();
    const legacyId = new Types.ObjectId();
    const records = [
        {_id:normalId, isMature:false},
        {_id:matureId, isMature:true},
        {_id:legacyId}
    ];
    let findById:jest.Mock;
    let service:ContentAccessService;

    beforeEach(() => {
        findById = jest.fn();
        const usersService = {findById} as unknown as UsersService;
        const seriesModel = {
            exists:jest.fn(async(query: {
                _id:Types.ObjectId;
                isMature?:{$ne:boolean};
            }) => {
                const record = records.find(item => item._id.equals(query._id));

                if (!record) return null;
                if (query.isMature?.$ne === true && record.isMature === true) return null;

                return {_id:record._id};
            })
        } as unknown as Model<SerieDocument>;

        service = new ContentAccessService(usersService, seriesModel);
    });

    it("oculta solo isMature=true y mantiene visibles documentos antiguos", async() => {
        findById.mockResolvedValue({showMatureContent:false});
        const policy = await service.forUser(new Types.ObjectId());

        expect(policy.seriesMatch).toEqual({isMature:{$ne:true}});
        expect(service.forJoinedSeries("serieInfo", policy)).toEqual({
            "serieInfo.isMature":{$ne:true}
        });
        expect(service.seriesAccessStages(policy)).toEqual([
            {$lookup:{from:"series", localField:"serie", foreignField:"_id", as:"contentAccessSerie"}},
            {$unwind:{path:"$contentAccessSerie"}},
            {$match:{"contentAccessSerie.isMature":{$ne:true}}},
            {$unset:"contentAccessSerie"}
        ]);
        await expect(service.assertSeriesAccessible(normalId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(legacyId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(matureId, policy)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("permite series normales y maduras cuando la preferencia está activa", async() => {
        findById.mockResolvedValue({showMatureContent:true});
        const policy = await service.forUser(new Types.ObjectId());

        expect(policy.seriesMatch).toEqual({});
        expect(service.seriesAccessStages(policy)).toEqual([]);
        await expect(service.assertSeriesAccessible(normalId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(matureId, policy)).resolves.toBeUndefined();
    });
});
