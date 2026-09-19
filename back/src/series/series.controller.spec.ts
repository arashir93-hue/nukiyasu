import {
    ExecutionContext,
    ForbiddenException,
    INestApplication,
    ValidationPipe
} from "@nestjs/common";
import {CACHE_MANAGER} from "@nestjs/cache-manager";
import {APP_PIPE} from "@nestjs/core";
import {Test} from "@nestjs/testing";
import {Types} from "mongoose";
import * as request from "supertest";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {BooksService} from "../books/books.service";
import {ReadlistService} from "../readlist/readlist.service";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {UsersService} from "../users/users.service";
import {WebsocketsGateway} from "../websockets/websockets.gateway";
import {SeriesController} from "./series.controller";
import {SeriesService} from "./series.service";

describe("SeriesController mature classification", () => {
    let app:INestApplication;
    let seriesService: {editSerie:jest.Mock};
    let usersService: {isAdmin:jest.Mock};
    const authenticatedUserId = new Types.ObjectId();
    const serieId = new Types.ObjectId();

    beforeEach(async() => {
        seriesService = {editSerie:jest.fn()};
        usersService = {isAdmin:jest.fn()};

        const moduleRef = await Test.createTestingModule({
            controllers:[SeriesController],
            providers:[
                {provide:SeriesService, useValue:seriesService},
                {provide:BooksService, useValue:{}},
                {provide:WebsocketsGateway, useValue:{sendNotificationToClient:jest.fn()}},
                {provide:UsersService, useValue:usersService},
                {provide:ReadlistService, useValue:{}},
                {provide:SerieprogressService, useValue:{}},
                {provide:CACHE_MANAGER, useValue:{}},
                {
                    provide:APP_PIPE,
                    useValue:new ValidationPipe({whitelist:true, transform:true})
                }
            ]
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({
                canActivate(context:ExecutionContext) {
                    context.switchToHttp().getRequest().user = {userId:authenticatedUserId};
                    return true;
                }
            })
            .compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix("api");
        await app.init();
    });

    afterEach(async() => {
        await app.close();
    });

    it.each([true, false])("permite a un administrador establecer isMature=%p", async(isMature) => {
        usersService.isAdmin.mockResolvedValue(true);
        seriesService.editSerie.mockResolvedValue({isMature});

        await request(app.getHttpServer())
            .patch(`/api/series/${serieId.toString()}`)
            .send({isMature})
            .expect(200);

        expect(usersService.isAdmin).toHaveBeenCalledWith(authenticatedUserId);
        expect(seriesService.editSerie).toHaveBeenCalledWith(
            serieId,
            expect.objectContaining({isMature, lastModifiedDate:expect.any(Date)})
        );
    });

    it("impide que un usuario normal modifique isMature", async() => {
        usersService.isAdmin.mockRejectedValue(new ForbiddenException());

        await request(app.getHttpServer())
            .patch(`/api/series/${serieId.toString()}`)
            .send({isMature:true})
            .expect(403);

        expect(seriesService.editSerie).not.toHaveBeenCalled();
    });

    it.each(["true", 1, null])("rechaza isMature no booleano: %p", async(invalidValue) => {
        usersService.isAdmin.mockResolvedValue(true);

        await request(app.getHttpServer())
            .patch(`/api/series/${serieId.toString()}`)
            .send({isMature:invalidValue})
            .expect(400);

        expect(usersService.isAdmin).not.toHaveBeenCalled();
        expect(seriesService.editSerie).not.toHaveBeenCalled();
    });
});
