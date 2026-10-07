import {ExecutionContext, INestApplication, ValidationPipe} from "@nestjs/common";
import {Test} from "@nestjs/testing";
import * as request from "supertest";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ContentAccessService} from "../content-access/content-access.service";
import {DoujinshiFavoritesController} from "./doujinshi-favorites.controller";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";

describe("DoujinshiFavoritesController", () => {
    let app:INestApplication;
    const userId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const policy = {showMatureContent:false, seriesMatch:{isMature:{$ne:true}}};
    const favoritesService = {
        addFavorite:jest.fn().mockResolvedValue({isFavorite:true}),
        removeFavorite:jest.fn().mockResolvedValue({isFavorite:false}),
        listFavorites:jest.fn().mockResolvedValue({data:[], pages:0}),
        batchStatus:jest.fn().mockResolvedValue({[serieId.toString()]:{isFavorite:true}})
    };
    const contentAccessService = {
        forUser:jest.fn().mockResolvedValue(policy)
    };

    beforeEach(async() => {
        jest.clearAllMocks();
        const moduleRef = await Test.createTestingModule({
            controllers:[DoujinshiFavoritesController],
            providers:[
                {provide:DoujinshiFavoritesService, useValue:favoritesService},
                {provide:ContentAccessService, useValue:contentAccessService}
            ]
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({
                canActivate(context:ExecutionContext) {
                    context.switchToHttp().getRequest().user = {userId};
                    return true;
                }
            })
            .compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix("api");
        app.useGlobalPipes(new ValidationPipe({whitelist:true, transform:true}));
        await app.init();
    });

    afterEach(async() => {
        await app.close();
    });

    it("toma el usuario del JWT y no acepta userId del cliente", async() => {
        await request(app.getHttpServer())
            .put(`/api/doujinshi/series/${serieId}/favorite`)
            .send({userId:new Types.ObjectId().toString()})
            .expect(200);

        expect(favoritesService.addFavorite).toHaveBeenCalledWith(userId, serieId, policy);
    });

    it("lista favoritos con paginación", async() => {
        await request(app.getHttpServer())
            .get("/api/doujinshi/favorites?page=2&limit=10")
            .expect(200);

        expect(favoritesService.listFavorites).toHaveBeenCalledWith(userId, policy, 2, 10);
    });

    it("rechaza ObjectIds inválidos", async() => {
        await request(app.getHttpServer())
            .put("/api/doujinshi/series/not-an-id/favorite")
            .expect(400);

        expect(favoritesService.addFavorite).not.toHaveBeenCalled();
    });

    it("valida el límite del batch", async() => {
        const ids = Array.from({length:101}, () => new Types.ObjectId().toString());

        await request(app.getHttpServer())
            .post("/api/doujinshi/organization/batch")
            .send({serieIds:ids})
            .expect(400);

        expect(favoritesService.batchStatus).not.toHaveBeenCalled();
    });

    it("deduplica IDs antes de la consulta agrupada", async() => {
        const id = serieId.toString();

        await request(app.getHttpServer())
            .post("/api/doujinshi/organization/batch")
            .send({serieIds:[id, id]})
            .expect(201);

        expect(favoritesService.batchStatus).toHaveBeenCalledWith(userId, [serieId], policy);
    });
});
