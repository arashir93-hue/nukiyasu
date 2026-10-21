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
        seriesMatch:{missing:{$ne:true}, isMature:{$ne:true}}
    };
    const joinedSeriesMatch = {
        forJoinedSeries:jest.fn().mockReturnValue({
            "contentAccessSerie.missing":{$ne:true},
            "contentAccessSerie.isMature":{$ne:true}
        })
    } as unknown as ContentAccessService;

    function createService(bookAggregate:ReturnType<typeof createAggregate>) {
        return new BooksService(
            {aggregate:jest.fn().mockReturnValue(bookAggregate)} as unknown as Model<BookDocument>,
            joinedSeriesMatch
        );
    }

    function paginationStages(bookAggregate:ReturnType<typeof createAggregate>) {
        return bookAggregate.stages.filter((stage:Record<string, unknown>) =>
            "$skip" in stage || "$limit" in stage
        );
    }

    it.each([
        {page:1, skip:0, first:1, last:100},
        {page:2, skip:100, first:101, last:200},
        {page:3, skip:200, first:201, last:300}
    ])("pagina sin status $page aplica skip/limit una sola vez", async({page, skip, first, last}) => {
        const bookAggregate = createAggregate(
            Array.from({length:100}, (_, index) => ({path:`book-${first + index}`}))
        );

        await createService(bookAggregate).filterAccessibleBooks(
            new Types.ObjectId(),
            "all",
            {page, limit:100, sort:"sortName"},
            {showMatureContent:true, seriesMatch:{}}
        );

        expect(paginationStages(bookAggregate)).toEqual([
            {$skip:skip},
            {$limit:100}
        ]);
        expect(bookAggregate.stages).toContainEqual({$sort:{sortName:"asc", _id:"asc"}});
        expect(last - first + 1).toBe(100);
    });

    it("pagina después del filtrado por status y no vuelve a paginar al principio", async() => {
        const bookAggregate = createAggregate(Array.from({length:42}, (_, index) => ({path:`book-${index}`})));

        const books = await createService(bookAggregate).filterAccessibleBooks(
            new Types.ObjectId(),
            "all",
            {page:3, limit:100, status:"completed", sort:"sortName"},
            {showMatureContent:true, seriesMatch:{}}
        );

        const statusIndex = bookAggregate.stages.findIndex((stage:Record<string, unknown>) =>
            JSON.stringify(stage) === JSON.stringify({$match:{status:"completed"}})
        );
        const skipIndex = bookAggregate.stages.findIndex((stage:Record<string, unknown>) => "$skip" in stage);

        expect(books).toHaveLength(42);
        expect(paginationStages(bookAggregate)).toEqual([
            {$skip:200},
            {$limit:100}
        ]);
        expect(statusIndex).toBeGreaterThan(-1);
        expect(statusIndex).toBeLessThan(skipIndex);
    });

    it("mantiene un orden estable incluso sin campo sort explícito", async() => {
        const bookAggregate = createAggregate([]);

        await createService(bookAggregate).filterAccessibleBooks(
            new Types.ObjectId(),
            "all",
            {page:2, limit:100},
            {showMatureContent:true, seriesMatch:{}}
        );

        expect(bookAggregate.stages).toContainEqual({$sort:{_id:"asc"}});
        expect(paginationStages(bookAggregate)).toEqual([
            {$skip:100},
            {$limit:100}
        ]);
    });

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
            JSON.stringify(stage) === JSON.stringify({$match:{"contentAccessSerie.missing":{$ne:true}, "contentAccessSerie.isMature":{$ne:true}}})
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
            findOne:jest.fn().mockResolvedValue({_id:new Types.ObjectId(), serie:serieId})
        } as unknown as Model<BookDocument>;
        const contentAccessService = {
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        } as unknown as ContentAccessService;
        const service = new BooksService(bookModel, contentAccessService);

        await expect(
            service.findAccessibleById(new Types.ObjectId(), standardPolicy)
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("excluye libros marcados como desaparecidos antes de construir resultados", async() => {
        const bookAggregate = createAggregate([]);
        const service = new BooksService(
            {aggregate:jest.fn().mockReturnValue(bookAggregate)} as unknown as Model<BookDocument>,
            joinedSeriesMatch
        );

        await service.filterAccessibleBooks(new Types.ObjectId(), "manga", {}, {
            showMatureContent:true,
            seriesMatch:{missing:{$ne:true}}
        });

        expect(bookAggregate.stages).toContainEqual({$match:{missing:{$ne:true}}});
    });

    it("reactiva un Book desaparecido sin crear un duplicado", async() => {
        const existing = {_id:new Types.ObjectId(), path:"v01", missing:true};
        const findOneAndUpdate = jest.fn().mockResolvedValue({...existing, missing:false});
        const bookModel = {
            findOne:jest.fn().mockResolvedValue(existing),
            findOneAndUpdate
        } as unknown as Model<BookDocument>;
        const service = new BooksService(bookModel, joinedSeriesMatch);

        await service.updateOrCreate({
            path:"v01",
            visibleName:"v01",
            sortName:"v01",
            serie:new Types.ObjectId(),
            seriePath:"Serie",
            thumbnailPath:"001.jpg",
            characters:0,
            variant:"manga"
        });

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            {path:"v01", variant:"manga"},
            {$set:{missing:false, characters:0, thumbnailPath:"001.jpg"}},
            {new:true}
        );
    });

    it("refresca un Mokuro conservando el mismo _id y metadatos de progreso", async() => {
        const id = new Types.ObjectId();
        const findByIdAndUpdate = jest.fn().mockResolvedValue({_id:id});
        const service = new BooksService(
            {findByIdAndUpdate} as unknown as Model<BookDocument>,
            joinedSeriesMatch
        );

        await service.refreshMokuro(id, {
            imagesFolder:"v01",
            thumbnailPath:"001.jpg",
            pages:168,
            characters:1200,
            pageChars:[10, 20],
            sourceVersion:"200:40:168"
        });

        expect(findByIdAndUpdate).toHaveBeenCalledWith(
            id,
            {$set:{
                imagesFolder:"v01",
                thumbnailPath:"001.jpg",
                pages:168,
                characters:1200,
                pageChars:[10, 20],
                sourceVersion:"200:40:168",
                format:"mokuro",
                missing:false
            }},
            {new:true}
        );
    });
});
