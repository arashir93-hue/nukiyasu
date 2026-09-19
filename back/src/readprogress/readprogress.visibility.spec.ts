import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {BooksService} from "../books/books.service";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {ReadlistService} from "../readlist/readlist.service";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {ReadprogressController} from "./readprogress.controller";
import {ReadprogressService} from "./readprogress.service";
import {ReadProgress} from "./schemas/readprogress.schema";

function createAggregate(results:unknown[] = []) {
    const stages:Record<string, unknown>[] = [];
    const aggregate:Record<string, any> = {stages};
    for (const stage of [
        "match", "lookup", "unwind", "sort", "skip", "limit", "group",
        "project", "addFields", "replaceRoot"
    ]) {
        aggregate[stage] = (value:unknown) => {
            stages.push({[`$${stage}`]:value});
            return aggregate;
        };
    }
    aggregate.append = (...values:Record<string, unknown>[]) => {
        stages.push(...values);
        return aggregate;
    };
    aggregate.pipeline = () => stages.map(stage => ({...stage}));
    aggregate.then = (resolve:(value:unknown[])=>unknown) => Promise.resolve(resolve(results));
    return aggregate;
}

describe("Readprogress mature visibility", () => {
    const userId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const bookId = new Types.ObjectId();
    const progressId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };
    const accessStage = {$match:{"contentAccessSerie.isMature":{$ne:true}}};

    it("filtra historial antes de contar y paginar", async() => {
        const historyAggregate = createAggregate([{bookInfo:{visibleName:"Normal"}}]);
        let countPipeline:Record<string, unknown>[] = [];
        const model = {
            aggregate:jest.fn((pipeline?:Record<string, unknown>[]) => {
                if (!pipeline) return historyAggregate;
                countPipeline = pipeline;
                return {count:jest.fn().mockResolvedValue([{total:1}])};
            })
        } as unknown as Model<ReadProgress>;
        const contentAccess = {
            forJoinedSeries:jest.fn().mockReturnValue({"serieInfo.isMature":{$ne:true}}),
            seriesAccessStages:jest.fn().mockReturnValue([accessStage])
        } as unknown as ContentAccessService;
        const service = new ReadprogressService(model, {} as SerieprogressService, contentAccess);

        const response = await service.findUserProgresses(userId, 1, 10, "!lastUpdateDate", policy);

        expect(countPipeline).toContainEqual({$match:{"serieInfo.isMature":{$ne:true}}});
        expect(countPipeline.some(stage => "$skip" in stage || "$limit" in stage)).toBe(false);
        expect(historyAggregate.stages.findIndex((stage:Record<string, unknown>) => "$match" in stage))
            .toBeLessThan(historyAggregate.stages.findIndex((stage:Record<string, unknown>) => "$skip" in stage));
        expect(response.total).toBe(1);
    });

    it("excluye contenido oculto antes de agrupar estadísticas", async() => {
        const statsAggregate = createAggregate([{
            totalMangaBooks:1,
            totalNovelaBooks:0,
            totalMangaSeries:[serieId],
            totalNovelaSeries:[],
            totalPagesRead:20,
            totalCharacters:100,
            totalTimeRead:5
        }]);
        const model = {
            aggregate:jest.fn().mockReturnValue(statsAggregate)
        } as unknown as Model<ReadProgress>;
        const contentAccess = {
            seriesAccessStages:jest.fn().mockReturnValue([accessStage])
        } as unknown as ContentAccessService;
        const service = new ReadprogressService(model, {} as SerieprogressService, contentAccess);

        const stats = await service.getUserStats(userId, policy);
        const accessIndex = statsAggregate.stages.indexOf(accessStage);
        const groupIndex = statsAggregate.stages.findIndex((stage:Record<string, unknown>) => "$group" in stage);

        expect(accessIndex).toBeGreaterThan(-1);
        expect(accessIndex).toBeLessThan(groupIndex);
        expect(stats).toEqual(expect.objectContaining({totalMangaBooks:1, totalMangaSeries:1}));
    });

    it("no crea, edita ni elimina progreso oculto", async() => {
        const readprogressService = {
            findProgressByBookAndUser:jest.fn(),
            createReadProgress:jest.fn(),
            findByIdForUser:jest.fn().mockResolvedValue({serie:serieId}),
            modifyReadProgress:jest.fn(),
            deleteReadProgress:jest.fn()
        };
        const booksService = {
            findAccessibleById:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new ReadprogressController(
            readprogressService as unknown as ReadprogressService,
            {
                findSerieInReadList:jest.fn().mockResolvedValue(null)
            } as unknown as ReadlistService,
            booksService as unknown as BooksService,
            {} as SerieprogressService,
            contentAccess as unknown as ContentAccessService
        );
        const request = {user:{userId}} as never;

        await expect(
            controller.modifyOrCreateProgress(request, {book:bookId, status:"reading"})
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            controller.editProgress(request, progressId, {currentPage:2})
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            controller.deleteReadProgress(request, progressId)
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(readprogressService.createReadProgress).not.toHaveBeenCalled();
        expect(readprogressService.modifyReadProgress).not.toHaveBeenCalled();
        expect(readprogressService.deleteReadProgress).not.toHaveBeenCalled();
    });

    it("con acceso completo conserva los datos y las mutaciones", async() => {
        const allPolicy:ContentAccessPolicy = {showMatureContent:true, seriesMatch:{}};
        const foundBook = {serie:serieId, variant:"manga"};
        const readprogressService = {
            findProgressByBookAndUser:jest.fn().mockResolvedValue(null),
            createReadProgress:jest.fn().mockResolvedValue({book:bookId})
        };
        const contentAccess = {forUser:jest.fn().mockResolvedValue(allPolicy)};
        const controller = new ReadprogressController(
            readprogressService as unknown as ReadprogressService,
            {
                findSerieInReadList:jest.fn().mockResolvedValue(null)
            } as unknown as ReadlistService,
            {findAccessibleById:jest.fn().mockResolvedValue(foundBook)} as unknown as BooksService,
            {createOrIncreaseBooks:jest.fn()} as unknown as SerieprogressService,
            contentAccess as unknown as ContentAccessService
        );

        await controller.modifyOrCreateProgress(
            {user:{userId}} as never,
            {book:bookId, status:"reading"}
        );

        expect(readprogressService.createReadProgress).toHaveBeenCalled();
    });
});
