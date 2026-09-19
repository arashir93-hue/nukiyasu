import {NotFoundException} from "@nestjs/common";
import {Response} from "express";
import {Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {ReadlistService} from "../readlist/readlist.service";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {SeriesController} from "../series/series.controller";
import {SeriesService} from "../series/series.service";
import {UsersService} from "../users/users.service";
import {WebsocketsGateway} from "../websockets/websockets.gateway";
import {BooksController} from "./books.controller";
import {BooksService} from "./books.service";
import * as zipDownload from "./helpers/zipDownload";
import * as fs from "fs-extra";

describe("File downloads mature visibility", () => {
    const userId = new Types.ObjectId();
    const resourceId = new Types.ObjectId();
    const hiddenPolicy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };
    const fullPolicy:ContentAccessPolicy = {showMatureContent:true, seriesMatch:{}};
    const request = {user:{userId}} as never;
    const response = {} as Response;

    beforeEach(() => {
        jest.spyOn(zipDownload, "streamFileToResponse").mockResolvedValue(undefined);
        jest.spyOn(zipDownload, "streamZipToResponse").mockResolvedValue(undefined);
        jest.spyOn(fs, "existsSync").mockReturnValue(true);
    });

    afterEach(() => jest.restoreAllMocks());

    it("no entrega la descarga individual de un libro oculto", async() => {
        const booksService = {
            findAccessibleById:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new BooksController(
            booksService as unknown as BooksService,
            {} as UsersService,
            {} as WebsocketsGateway,
            {forUser:jest.fn().mockResolvedValue(hiddenPolicy)} as unknown as ContentAccessService
        );

        await expect(controller.downloadZip(request, response, resourceId))
            .rejects.toBeInstanceOf(NotFoundException);
        expect(zipDownload.streamFileToResponse).not.toHaveBeenCalled();
        expect(zipDownload.streamZipToResponse).not.toHaveBeenCalled();
    });

    it("no construye ni entrega el ZIP de una serie oculta", async() => {
        const seriesService = {
            findAccessibleById:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new SeriesController(
            seriesService as unknown as SeriesService,
            {} as BooksService,
            {} as WebsocketsGateway,
            {} as UsersService,
            {} as ReadlistService,
            {} as SerieprogressService,
            {forUser:jest.fn().mockResolvedValue(hiddenPolicy)} as unknown as ContentAccessService
        );

        await expect(controller.downloadZip(request, response, resourceId))
            .rejects.toBeInstanceOf(NotFoundException);
        expect(zipDownload.streamZipToResponse).not.toHaveBeenCalled();
    });

    it.each([hiddenPolicy, fullPolicy])("conserva la descarga de libros accesibles con policy %p", async(policy) => {
        const foundBook = {
            _id:resourceId,
            variant:"novela",
            seriePath:"Normal",
            path:"Volumen 1",
            sortName:"Volumen 1"
        };
        const booksService = {findAccessibleById:jest.fn().mockResolvedValue(foundBook)};
        const controller = new BooksController(
            booksService as unknown as BooksService,
            {} as UsersService,
            {} as WebsocketsGateway,
            {forUser:jest.fn().mockResolvedValue(policy)} as unknown as ContentAccessService
        );

        await controller.downloadZip(request, response, resourceId);

        expect(booksService.findAccessibleById).toHaveBeenCalledWith(resourceId, policy);
        expect(zipDownload.streamFileToResponse).toHaveBeenCalled();
    });

    it.each([hiddenPolicy, fullPolicy])("conserva la descarga de series accesibles con policy %p", async(policy) => {
        const foundSerie = {
            _id:resourceId,
            variant:"manga",
            path:"Normal",
            sortName:"Normal"
        };
        const seriesService = {findAccessibleById:jest.fn().mockResolvedValue(foundSerie)};
        const controller = new SeriesController(
            seriesService as unknown as SeriesService,
            {} as BooksService,
            {} as WebsocketsGateway,
            {} as UsersService,
            {} as ReadlistService,
            {} as SerieprogressService,
            {forUser:jest.fn().mockResolvedValue(policy)} as unknown as ContentAccessService
        );

        await controller.downloadZip(request, response, resourceId);

        expect(seriesService.findAccessibleById).toHaveBeenCalledWith(resourceId, policy);
        expect(zipDownload.streamZipToResponse).toHaveBeenCalled();
    });
});
