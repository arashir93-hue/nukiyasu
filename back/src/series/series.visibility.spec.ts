import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy} from "../content-access/content-access.service";
import {UsersService} from "../users/users.service";
import {SerieDocument} from "./schemas/series.schema";
import {SeriesService} from "./series.service";

function createAggregate(results:unknown[] = []) {
    const stages:Record<string, unknown>[] = [];
    const aggregate:Record<string, any> = {stages};
    const chainStage = (name:string) => (value:unknown) => {
        stages.push({[name]:value});
        return aggregate;
    };

    aggregate.collation = chainStage("$collation");
    aggregate.match = chainStage("$match");
    aggregate.lookup = chainStage("$lookup");
    aggregate.unwind = chainStage("$unwind");
    aggregate.group = chainStage("$group");
    aggregate.sort = chainStage("$sort");
    aggregate.skip = chainStage("$skip");
    aggregate.limit = chainStage("$limit");
    aggregate.project = chainStage("$project");
    aggregate.pipeline = () => stages.map(stage => ({...stage}));
    aggregate.then = (resolve:(value:unknown[])=>unknown) => Promise.resolve(resolve(results));

    return aggregate;
}

describe("SeriesService mature visibility", () => {
    const standardPolicy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{missing:{$ne:true}, isMature:{$ne:true}}
    };

    it("filtra y cuenta antes de paginar sin aceptar bypass del cliente", async() => {
        const resultAggregate = createAggregate([{visibleName:"Normal"}]);
        let countPipeline:Record<string, unknown>[] = [];
        const aggregate = jest.fn((pipeline?:Record<string, unknown>[]) => {
            if (!pipeline) return resultAggregate;

            countPipeline = pipeline;
            return {count:jest.fn().mockResolvedValue([{total:2}])};
        });
        const seriesModel = {aggregate} as unknown as Model<SerieDocument>;
        const service = new SeriesService(seriesModel, {} as UsersService);
        const response = await service.filterSeries(
            new Types.ObjectId(),
            "all",
            {page:2, limit:1, includeMature:true} as never,
            standardPolicy
        );

        const accessIndex = resultAggregate.stages.findIndex(
            (stage:Record<string, unknown>) => JSON.stringify(stage) === JSON.stringify({$match:{missing:{$ne:true}, isMature:{$ne:true}}})
        );
        const paginationIndex = resultAggregate.stages.findIndex(
            (stage:Record<string, unknown>) => "$skip" in stage
        );

        expect(accessIndex).toBeGreaterThan(-1);
        expect(accessIndex).toBeLessThan(paginationIndex);
        expect(countPipeline).toContainEqual({$match:{missing:{$ne:true}, isMature:{$ne:true}}});
        expect(countPipeline.some(stage => "$skip" in stage || "$limit" in stage)).toBe(false);
        expect(response.pages).toBe(2);
    });

    it("devuelve 404 para acceso directo a una serie madura", async() => {
        const seriesAggregate = createAggregate([]);
        const service = new SeriesService(
            {aggregate:jest.fn().mockReturnValue(seriesAggregate)} as unknown as Model<SerieDocument>,
            {} as UsersService
        );

        await expect(
            service.findAccessibleById(new Types.ObjectId(), standardPolicy)
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(seriesAggregate.stages).toContainEqual({$match:expect.objectContaining({
            isMature:{$ne:true}
        })});
    });

    it("permite acceso directo a una serie antigua sin isMature", async() => {
        const legacySerie = {_id:new Types.ObjectId(), visibleName:"Antigua", reviews:[]};
        const service = new SeriesService(
            {aggregate:jest.fn().mockReturnValue(createAggregate([legacySerie]))} as unknown as Model<SerieDocument>,
            {} as UsersService
        );

        await expect(
            service.findAccessibleById(legacySerie._id, standardPolicy)
        ).resolves.toEqual(legacySerie);
    });

    it("no limita series cuando la preferencia está activa", async() => {
        const resultAggregate = createAggregate([
            {visibleName:"Normal", isMature:false},
            {visibleName:"Madura", isMature:true}
        ]);
        const aggregate = jest.fn((pipeline?:Record<string, unknown>[]) => {
            if (!pipeline) return resultAggregate;
            return {count:jest.fn().mockResolvedValue([{total:2}])};
        });
        const service = new SeriesService(
            {aggregate} as unknown as Model<SerieDocument>,
            {} as UsersService
        );
        const policy:ContentAccessPolicy = {
            showMatureContent:true,
            seriesMatch:{}
        };

        const response = await service.filterSeries(
            new Types.ObjectId(),
            "all",
            {},
            policy
        );

        expect(response.data).toHaveLength(2);
        expect(resultAggregate.stages).toContainEqual({$match:{missing:{$ne:true}, bookCount:{$gt:0}}});
    });
});
