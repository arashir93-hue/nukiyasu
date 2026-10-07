import {ExecutionContext, INestApplication, ValidationPipe} from "@nestjs/common";
import {Test} from "@nestjs/testing";
import * as request from "supertest";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ContentAccessService} from "../content-access/content-access.service";
import {DoujinshiFavoritesController} from "./doujinshi-favorites.controller";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";
import {DoujinshiCollectionsService} from "./doujinshi-collections.service";

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
    const collectionsService = {
        batchCollectionStatus:jest.fn().mockResolvedValue({[serieId.toString()]:{collectionIds:[]}}),
        listCollections:jest.fn().mockResolvedValue([]),
        createCollection:jest.fn(),
        updateCollection:jest.fn(),
        deleteCollection:jest.fn(),
        listItems:jest.fn(),
        addItem:jest.fn(),
        removeItem:jest.fn()
    };

    beforeEach(async() => {
        jest.clearAllMocks();
        const moduleRef = await Test.createTestingModule({
            controllers:[DoujinshiFavoritesController],
            providers:[
                {provide:DoujinshiFavoritesService, useValue:favoritesService},
                {provide:ContentAccessService, useValue:contentAccessService},
                {provide:DoujinshiCollectionsService, useValue:collectionsService}
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

    it("crea colecciones y aplica trim mediante el DTO real", async() => {
        await request(app.getHttpServer())
            .post("/api/doujinshi/collections")
            .send({name:"  Comedia  ", user:new Types.ObjectId().toString()})
            .expect(201);

        expect(collectionsService.createCollection).toHaveBeenCalledWith(userId, {name:"Comedia"});
    });

    it("rechaza nombres vacíos y de más de 80 caracteres", async() => {
        await request(app.getHttpServer())
            .post("/api/doujinshi/collections")
            .send({name:"   "})
            .expect(400);
        await request(app.getHttpServer())
            .post("/api/doujinshi/collections")
            .send({name:"a".repeat(81)})
            .expect(400);

        expect(collectionsService.createCollection).not.toHaveBeenCalled();
    });

    it("actualiza solo los campos permitidos de una colección", async() => {
        const collectionId = new Types.ObjectId();

        await request(app.getHttpServer())
            .patch(`/api/doujinshi/collections/${collectionId}`)
            .send({name:"Nueva", isFavorite:true, sortOrder:3, user:new Types.ObjectId().toString(), normalizedName:"hack"})
            .expect(200);

        expect(collectionsService.updateCollection).toHaveBeenCalledWith(
            userId,
            collectionId,
            {name:"Nueva", isFavorite:true, sortOrder:3}
        );
    });

    it("delega las operaciones de colección usando el usuario del JWT", async() => {
        const collectionId = new Types.ObjectId();

        await request(app.getHttpServer())
            .get(`/api/doujinshi/collections/${collectionId}/items?page=2&limit=5`)
            .expect(200);
        await request(app.getHttpServer())
            .put(`/api/doujinshi/collections/${collectionId}/items/${serieId}`)
            .expect(200);
        await request(app.getHttpServer())
            .delete(`/api/doujinshi/collections/${collectionId}/items/${serieId}`)
            .expect(200);

        expect(collectionsService.listItems).toHaveBeenCalledWith(userId, collectionId, policy, 2, 5);
        expect(collectionsService.addItem).toHaveBeenCalledWith(userId, collectionId, serieId, policy);
        expect(collectionsService.removeItem).toHaveBeenCalledWith(userId, collectionId, serieId);
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
        expect(collectionsService.batchCollectionStatus).toHaveBeenCalledWith(userId, [serieId], policy);
    });
});
