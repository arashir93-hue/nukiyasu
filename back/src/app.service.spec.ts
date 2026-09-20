import {Queue} from "bull";
import {Types} from "mongoose";
import {BooksService} from "./books/books.service";
import {WebsocketsGateway} from "./websockets/websockets.gateway";
import {SeriesService} from "./series/series.service";
import {AppService} from "./app.service";

describe("AppService image library variants", () => {
    it("omite una raíz doujinshi ausente sin interrumpir la aplicación", async() => {
        const service = new AppService(
            {ensureVariantMaturity:jest.fn()} as unknown as SeriesService,
            {} as BooksService,
            {} as WebsocketsGateway,
            {} as Queue
        );

        await expect(service.rescanDoujinshiLibrary()).resolves.toBeUndefined();
    });

    it("recalcula el contador usando solo Books disponibles", async() => {
        const serieWithBooks = {_id:new Types.ObjectId()};
        const serieWithoutBooks = {_id:new Types.ObjectId()};
        const setBookCount = jest.fn().mockResolvedValue(undefined);
        const service = new AppService(
            {
                ensureVariantMaturity:jest.fn(),
                findNonMissing:jest.fn().mockResolvedValue([serieWithBooks, serieWithoutBooks]),
                setBookCount
            } as unknown as SeriesService,
            {
                findAvailable:jest.fn().mockResolvedValue([
                    {serie:serieWithBooks._id},
                    {serie:serieWithBooks._id}
                ])
            } as unknown as BooksService,
            {} as WebsocketsGateway,
            {} as Queue
        );

        const syncBookCounts = (service as unknown as {
            syncBookCounts:(variant:"manga" | "novela" | "doujinshi") => Promise<void>
        }).syncBookCounts;
        await syncBookCounts.call(service, "manga");

        expect(setBookCount).toHaveBeenCalledWith(serieWithBooks._id, 2);
        expect(setBookCount).toHaveBeenCalledWith(serieWithoutBooks._id, 0);
    });
});
