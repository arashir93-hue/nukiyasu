import {NotFoundException} from "@nestjs/common";
import {Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {UsersService} from "../users/users.service";
import {WebsocketsGateway} from "../websockets/websockets.gateway";
import {BooksController} from "./books.controller";
import {BooksService} from "./books.service";

describe("BooksController mature navigation", () => {
    const userId = new Types.ObjectId();
    const bookId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };
    let booksService: {
        findAccessibleById:jest.Mock;
        filterAccessibleBooks:jest.Mock;
    };
    let controller:BooksController;

    beforeEach(() => {
        booksService = {
            findAccessibleById:jest.fn(),
            filterAccessibleBooks:jest.fn()
        };
        const contentAccessService = {
            forUser:jest.fn().mockResolvedValue(policy)
        };
        controller = new BooksController(
            booksService as unknown as BooksService,
            {} as UsersService,
            {} as WebsocketsGateway,
            contentAccessService as unknown as ContentAccessService
        );
    });

    it("no navega desde un libro oculto", async() => {
        booksService.findAccessibleById.mockRejectedValue(new NotFoundException());

        await expect(
            controller.getNextBook({user:{userId}} as never, bookId)
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(booksService.filterAccessibleBooks).not.toHaveBeenCalled();
    });

    it("tampoco navega hacia atrás desde un libro oculto", async() => {
        booksService.findAccessibleById.mockRejectedValue(new NotFoundException());

        await expect(
            controller.getPrevBook({user:{userId}} as never, bookId)
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(booksService.filterAccessibleBooks).not.toHaveBeenCalled();
    });

    it("no salta hacia un libro oculto al terminar la serie visible", async() => {
        const visibleBook = {
            _id:bookId,
            path:"visible",
            serie:new Types.ObjectId(),
            variant:"manga"
        };
        booksService.findAccessibleById.mockResolvedValue(visibleBook);
        booksService.filterAccessibleBooks.mockResolvedValue([visibleBook]);

        await expect(
            controller.getNextBook({user:{userId}} as never, bookId)
        ).resolves.toEqual({_id:"end"});
        expect(booksService.filterAccessibleBooks).toHaveBeenCalledWith(
            userId,
            "manga",
            {serie:visibleBook.serie, sort:"sortName"},
            policy
        );
    });
});
