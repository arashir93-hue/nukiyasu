import {Queue} from "bull";
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
});
