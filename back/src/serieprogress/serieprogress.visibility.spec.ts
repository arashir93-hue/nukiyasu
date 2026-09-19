import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {SerieProgressController} from "./serieprogress.controller";
import {SerieprogressService} from "./serieprogress.service";
import {SerieProgress} from "./schemas/serieprogress.schema";

function createAggregate(results:unknown[]) {
    const stages:Record<string, unknown>[] = [];
    const aggregate:Record<string, any> = {stages};
    for (const stage of ["match", "lookup", "unwind"]) {
        aggregate[stage] = (value:unknown) => {
            stages.push({[`$${stage}`]:value});
            return aggregate;
        };
    }
    aggregate.append = (...values:Record<string, unknown>[]) => {
        stages.push(...values);
        return aggregate;
    };
    aggregate.then = (resolve:(value:unknown[])=>unknown) => Promise.resolve(resolve(results));
    return aggregate;
}

describe("Serieprogress mature visibility", () => {
    const userId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };

    it("filtra paused y tablero antes de cargar libros", async() => {
        const pausedAggregate = createAggregate([]);
        const boardAggregate = createAggregate([]);
        const model = {
            aggregate:jest.fn()
                .mockReturnValueOnce(pausedAggregate)
                .mockReturnValueOnce(boardAggregate)
        } as unknown as Model<SerieProgress>;
        const accessStages = [{$match:{"contentAccessSerie.isMature":{$ne:true}}}];
        const contentAccess = {
            forJoinedSeries:jest.fn().mockReturnValue({"serieInfo.isMature":{$ne:true}}),
            seriesAccessStages:jest.fn().mockReturnValue(accessStages)
        } as unknown as ContentAccessService;
        const service = new SerieprogressService(model, contentAccess);

        await service.getUserPausedSeries(userId, "manga", policy);
        await service.getUserSeriesProgress(userId, policy);

        expect(pausedAggregate.stages).toContainEqual({$match:{"serieInfo.isMature":{$ne:true}}});
        expect(boardAggregate.stages.indexOf(accessStages[0]))
            .toBeLessThan(boardAggregate.stages.findIndex((stage:Record<string, unknown>) => "$lookup" in stage));
    });

    it("no cambia paused para una serie oculta", async() => {
        const serieProgressService = {pauseSerie:jest.fn()};
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new SerieProgressController(
            serieProgressService as unknown as SerieprogressService,
            contentAccess as unknown as ContentAccessService
        );

        await expect(
            controller.pauseSerie({user:{userId}} as never, serieId)
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(serieProgressService.pauseSerie).not.toHaveBeenCalled();
    });
});
