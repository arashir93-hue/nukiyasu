import {NotFoundException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {BookDocument} from "./schemas/book.schema";
import {BooksService} from "./books.service";

function createAggregate(results:unknown[] = []) {
    const stages:Record<string, unknown>[] = [];
    const aggregate:Record<string, any> = {stages};
    const chainStage = (name:string) => (value:unknown) => {
        stages.push({[name]:value});
        return aggregate;
    };

    for (const stage of [
        "collation", "match", "lookup", "unwind", "project", "sort",
        "skip", "limit", "addFields", "group"
    ]) {
        aggregate[stage] = chainStage(`$${stage}`);
    }
    aggregate.then = (resolve:(value:unknown[])=>unknown) => Promise.resolve(resolve(results));

    return aggregate;
}

describe("BooksService mature visibility", () => {
    const standardPolicy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };
    const joinedSeriesMatch = {
        forJoinedSeries:jest.fn().mockReturnValue({
            "contentAccessSerie.isMature":{$ne:true}
        })
    } as unknown as ContentAccessService;

    it("une con series y filtra antes de la primera paginación", async() => {
        const bookAggregate = createAggregate([{visibleName:"Normal"}]);
        const bookModel = {
            aggregate:jest.fn().mockReturnValue(bookAggregate)
        } as unknown as Model<BookDocument>;
        const service = new BooksService(bookModel, joinedSeriesMatch);

        await service.filterAccessibleBooks(
            new Types.ObjectId(),
            "all",
            {page:2, limit:1, includeMature:true} as never,
            standardPolicy
        );

        const seriesLookupIndex = bookAggregate.stages.findIndex((stage:Record<string, any>) =>
            stage.$lookup?.from === "series"
        );
        const matureMatchIndex = bookAggregate.stages.findIndex((stage:Record<string, unknown>) =>
            JSON.stringify(stage) === JSON.stringify({$match:{"contentAccessSerie.isMature":{$ne:true}}})
        );
        const paginationIndex = bookAggregate.stages.findIndex((stage:Record<string, unknown>) => "$skip" in stage);

        expect(seriesLookupIndex).toBeGreaterThan(-1);
        expect(matureMatchIndex).toBeGreaterThan(seriesLookupIndex);
        expect(matureMatchIndex).toBeLessThan(paginationIndex);
    });

    it("mantiene el comportamiento actual cuando la preferencia está activa", async() => {
        const bookAggregate = createAggregate([
            {visibleName:"Normal"},
            {visibleName:"Maduro"}
        ]);
        const service = new BooksService(
            {aggregate:jest.fn().mockReturnValue(bookAggregate)} as unknown as Model<BookDocument>,
            joinedSeriesMatch
        );
        const policy:ContentAccessPolicy = {
            showMatureContent:true,
            seriesMatch:{}
        };

        const books = await service.filterAccessibleBooks(
            new Types.ObjectId(),
            "all",
            {},
            policy
        );

        expect(books).toHaveLength(2);
        expect(bookAggregate.stages.some((stage:Record<string, any>) => stage.$lookup?.from === "series")).toBe(false);
    });

    it("devuelve 404 para un libro cuya serie no es accesible", async() => {
        const serieId = new Types.ObjectId();
        const bookModel = {
            findById:jest.fn().mockResolvedValue({_id:new Types.ObjectId(), serie:serieId})
        } as unknown as Model<BookDocument>;
        const contentAccessService = {
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        } as unknown as ContentAccessService;
        const service = new BooksService(bookModel, contentAccessService);

        await expect(
            service.findAccessibleById(new Types.ObjectId(), standardPolicy)
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
