import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {ReadlistController} from "./readlist.controller";
import {ReadlistService} from "./readlist.service";
import {ReadList} from "./schemas/readlist.schema";

function createAggregate(results:unknown[]) {
    const stages:Record<string, unknown>[] = [];
    const aggregate:Record<string, any> = {stages};
    for (const stage of ["match", "lookup", "unwind"]) {
        aggregate[stage] = (value:unknown) => {
            stages.push({[`$${stage}`]:value});
            return aggregate;
        };
    }
    aggregate.then = (resolve:(value:unknown[])=>unknown) => Promise.resolve(resolve(results));
    return aggregate;
}

describe("Readlist mature visibility", () => {
    const userId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };

    it("filtra la lista mediante la serie antes de devolver resultados", async() => {
        const aggregate = createAggregate([{serieInfo:{visibleName:"Normal"}}]);
        const deleteOne = jest.fn();
        const model = {
            aggregate:jest.fn().mockReturnValue(aggregate),
            deleteOne
        } as unknown as Model<ReadList>;
        const contentAccess = {
            forJoinedSeries:jest.fn().mockReturnValue({"serieInfo.isMature":{$ne:true}})
        } as unknown as ContentAccessService;
        const service = new ReadlistService(model, contentAccess);

        const result = await service.getUserReadListSeries(userId, "manga", policy);

        expect(result).toEqual([{visibleName:"Normal"}]);
        expect(aggregate.stages).toContainEqual({$match:{"serieInfo.isMature":{$ne:true}}});
        expect(deleteOne).not.toHaveBeenCalled();
    });

    it("no crea ni elimina registros de una serie oculta", async() => {
        const readlistService = {
            create:jest.fn(),
            removeSerieFromUserList:jest.fn()
        };
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new ReadlistController(
            readlistService as unknown as ReadlistService,
            contentAccess as unknown as ContentAccessService
        );
        const request = {user:{userId}} as never;

        await expect(controller.create(request, {serie:serieId})).rejects.toBeInstanceOf(NotFoundException);
        await expect(controller.removeBookFromList(request, {serie:serieId})).rejects.toBeInstanceOf(NotFoundException);
        expect(readlistService.create).not.toHaveBeenCalled();
        expect(readlistService.removeSerieFromUserList).not.toHaveBeenCalled();
    });

    it("con la preferencia activa conserva las mutaciones existentes", async() => {
        const allPolicy:ContentAccessPolicy = {showMatureContent:true, seriesMatch:{}};
        const readlistService = {create:jest.fn().mockResolvedValue({serie:serieId})};
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(allPolicy),
            assertSeriesAccessible:jest.fn().mockResolvedValue(undefined)
        };
        const controller = new ReadlistController(
            readlistService as unknown as ReadlistService,
            contentAccess as unknown as ContentAccessService
        );

        await controller.create({user:{userId}} as never, {serie:serieId});

        expect(readlistService.create).toHaveBeenCalledWith({user:userId, serie:serieId});
    });
});
