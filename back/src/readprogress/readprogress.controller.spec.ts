import {Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {BooksService} from "../books/books.service";
import {ReadlistService} from "../readlist/readlist.service";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {ReadprogressController} from "./readprogress.controller";
import {ReadprogressService} from "./readprogress.service";
import {ReadProgress, ReadProgressStatus} from "./schemas/readprogress.schema";

class InMemoryReadprogressService {
    readonly progresses:ReadProgress[] = [];

    findProgressByBookAndUser(book:Types.ObjectId, user:Types.ObjectId, status?:ReadProgressStatus):Promise<ReadProgress | null> {
        const found = this.progresses
            .filter(progress => progress.book.equals(book) && progress.user.equals(user))
            .filter(progress => !status || progress.status === status)
            .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];

        return Promise.resolve(found ?? null);
    }

    createReadProgress(data:Partial<ReadProgress>):Promise<ReadProgress> {
        const progress = {
            ...data,
            _id:new Types.ObjectId(),
            startDate:data.startDate ?? new Date(),
            lastUpdateDate:data.lastUpdateDate ?? new Date()
        } as ReadProgress;
        this.progresses.push(progress);
        return Promise.resolve(progress);
    }

    modifyReadProgress(id:Types.ObjectId, update:Partial<ReadProgress>):Promise<ReadProgress | null> {
        const progress = this.progresses.find(item => item._id?.equals(id));
        if (!progress) return Promise.resolve(null);

        Object.assign(progress, update);
        return Promise.resolve(progress);
    }
}

describe("ReadprogressController sessions", () => {
    const userId = new Types.ObjectId();
    const bookId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {showMatureContent:true, seriesMatch:{}};
    let progressService:InMemoryReadprogressService;
    let controller:ReadprogressController;

    beforeEach(() => {
        progressService = new InMemoryReadprogressService();
        controller = new ReadprogressController(
            progressService as unknown as ReadprogressService,
            {
                findSerieInReadList:jest.fn().mockResolvedValue(null),
                removeSerieWithId:jest.fn()
            } as unknown as ReadlistService,
            {
                findAccessibleById:jest.fn().mockResolvedValue({serie:serieId, variant:"manga"})
            } as unknown as BooksService,
            {
                createOrIncreaseBooks:jest.fn()
            } as unknown as SerieprogressService,
            {
                forUser:jest.fn().mockResolvedValue(policy)
            } as unknown as ContentAccessService
        );
    });

    const request = {user:{userId}} as never;

    it("mantiene una sesión activa y crea una nueva después de completed", async() => {
        const firstReading = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"reading",
            currentPage:1,
            time:10
        });
        const firstId = firstReading?._id;

        const continued = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"reading",
            currentPage:30,
            time:600
        });
        expect(continued?._id).toEqual(firstId);
        expect(continued?.currentPage).toBe(30);

        const firstCompleted = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"completed",
            currentPage:200,
            time:7500,
            characters:12000
        });
        expect(firstCompleted?._id).toEqual(firstId);
        expect(firstCompleted?.status).toBe("completed");

        const duplicateCompleted = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"completed",
            currentPage:200,
            time:7500
        });
        expect(duplicateCompleted?._id).toEqual(firstId);
        expect(progressService.progresses).toHaveLength(1);

        const secondReading = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"reading",
            currentPage:1,
            time:0
        });
        expect(secondReading?._id).not.toEqual(firstId);
        expect(secondReading?.status).toBe("reading");

        const partial = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"reading",
            currentPage:30,
            time:6120
        });
        expect(partial?._id).toEqual(secondReading?._id);

        const secondCompleted = await controller.modifyOrCreateProgress(request, {
            book:bookId,
            status:"completed",
            currentPage:200,
            time:6120,
            characters:12000
        });
        expect(secondCompleted?._id).toEqual(secondReading?._id);
        expect(progressService.progresses).toHaveLength(2);

        const recovered = await controller.getReadProgress(request, bookId);
        expect((recovered as ReadProgress)._id).toEqual(secondReading?._id);
    });

    it("crea una tercera sesión únicamente cuando se inicia con reading", async() => {
        await controller.modifyOrCreateProgress(request, {book:bookId, status:"completed", currentPage:200});
        const second = await controller.modifyOrCreateProgress(request, {book:bookId, status:"reading", currentPage:1});
        await controller.modifyOrCreateProgress(request, {book:bookId, status:"completed", currentPage:200});
        const third = await controller.modifyOrCreateProgress(request, {book:bookId, status:"reading", currentPage:1});

        expect(progressService.progresses).toHaveLength(3);
        expect(third?._id).not.toEqual(second?._id);
        expect(progressService.progresses[0]._id).not.toEqual(progressService.progresses[1]._id);
        expect(progressService.progresses[1]._id).not.toEqual(progressService.progresses[2]._id);
    });
});
