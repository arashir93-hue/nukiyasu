import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {SerieDocument} from "../series/schemas/series.schema";
import {UsersService} from "../users/users.service";
import {ContentAccessService} from "./content-access.service";

describe("ContentAccessService", () => {
    const normalId = new Types.ObjectId();
    const matureId = new Types.ObjectId();
    const legacyId = new Types.ObjectId();
    const doujinshiId = new Types.ObjectId();
    const records = [
        {_id:normalId, path:"Normal", variant:"manga", isMature:false},
        {_id:matureId, path:"Madura", variant:"manga", isMature:true},
        {_id:legacyId, path:"Antigua", variant:"novela"},
        {_id:doujinshiId, path:"Doujin", variant:"doujinshi", isMature:true}
    ];
    let findById:jest.Mock;
    let service:ContentAccessService;

    beforeEach(() => {
        findById = jest.fn();
        const usersService = {findById} as unknown as UsersService;
        const seriesModel = {
            exists:jest.fn(async(query: {
                _id?:Types.ObjectId;
                path?:string;
                variant?:"manga" | "novela" | "doujinshi";
                missing?:{$ne:boolean};
                isMature?:{$ne:boolean};
            }) => {
                const record: { _id:Types.ObjectId; path:string; variant:string; isMature?:boolean; missing?:boolean } | undefined = query._id
                    ? records.find(item => item._id.equals(query._id as Types.ObjectId))
                    : records.find(item => item.path === query.path && item.variant === query.variant);

                if (!record) return null;
                if (query.missing?.$ne === true && record.missing === true) return null;
                if (query.isMature?.$ne === true && record.isMature === true) return null;

                return {_id:record._id};
            })
        } as unknown as Model<SerieDocument>;

        service = new ContentAccessService(usersService, seriesModel);
    });

    it("oculta solo isMature=true y mantiene visibles documentos antiguos", async() => {
        findById.mockResolvedValue({showMatureContent:false});
        const policy = await service.forUser(new Types.ObjectId());

        expect(policy.seriesMatch).toEqual({missing:{$ne:true}, isMature:{$ne:true}});
        expect(service.forJoinedSeries("serieInfo", policy)).toEqual({
            "serieInfo.missing":{$ne:true},
            "serieInfo.isMature":{$ne:true}
        });
        expect(service.seriesAccessStages(policy)).toEqual([
            {$lookup:{from:"series", localField:"serie", foreignField:"_id", as:"contentAccessSerie"}},
            {$unwind:{path:"$contentAccessSerie"}},
            {$match:{"contentAccessSerie.missing":{$ne:true}, "contentAccessSerie.isMature":{$ne:true}}},
            {$unset:"contentAccessSerie"}
        ]);
        await expect(service.assertSeriesAccessible(normalId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(legacyId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(matureId, policy)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.assertStaticFileAccessible("manga", "Normal", policy)).resolves.toBeUndefined();
        await expect(service.assertStaticFileAccessible("novela", "Antigua", policy)).resolves.toBeUndefined();
        await expect(service.assertStaticFileAccessible("manga", "Madura", policy)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.assertStaticFileAccessible("doujinshi", "Doujin", policy)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("permite series normales y maduras cuando la preferencia está activa", async() => {
        findById.mockResolvedValue({showMatureContent:true});
        const policy = await service.forUser(new Types.ObjectId());

        expect(policy.seriesMatch).toEqual({missing:{$ne:true}});
        expect(service.seriesAccessStages(policy)).toEqual([
            {$lookup:{from:"series", localField:"serie", foreignField:"_id", as:"contentAccessSerie"}},
            {$unwind:{path:"$contentAccessSerie"}},
            {$match:{"contentAccessSerie.missing":{$ne:true}}},
            {$unset:"contentAccessSerie"}
        ]);
        await expect(service.assertSeriesAccessible(normalId, policy)).resolves.toBeUndefined();
        await expect(service.assertSeriesAccessible(matureId, policy)).resolves.toBeUndefined();
        await expect(service.assertStaticFileAccessible("manga", "Madura", policy)).resolves.toBeUndefined();
    });
});
