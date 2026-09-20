import {NotFoundException} from "@nestjs/common";
import {Queue} from "bull";
import {Request, Response} from "express";
import {Types} from "mongoose";
import {AppController} from "./app.controller";
import {AppService} from "./app.service";
import {ContentAccessPolicy, ContentAccessService} from "./content-access/content-access.service";
import {UsersService} from "./users/users.service";

describe("Static library mature visibility", () => {
    const userId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };

    function createResponse() {
        return {
            headersSent:false,
            sendFile:jest.fn((_path, _options, callback) => callback()),
            sendStatus:jest.fn(),
            end:jest.fn()
        } as unknown as Response;
    }

    function createController(contentAccess:Partial<ContentAccessService>) {
        return new AppController(
            {} as AppService,
            {} as UsersService,
            {} as Queue,
            contentAccess as ContentAccessService
        );
    }

    it.each([
        "/api/static/mangas/Madura/cover.jpg",
        "/api/static/mangas/Madura/Volumen%201/001.jpg",
        "/api/static/novelas/Madura/volumen.epub",
        "/api/static/thumbnails/mangas/Madura/cover.webp"
    ])("responde 404 antes de servir el recurso oculto %s", async(path) => {
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertStaticFileAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = createController(contentAccess);
        const response = createResponse();

        await expect(controller.serveFiles(
            {user:{userId}, path} as unknown as Request,
            response
        )).rejects.toBeInstanceOf(NotFoundException);

        expect(response.sendFile).not.toHaveBeenCalled();
    });

    it("reconoce la raíz estática doujinshi y delega su control mature", async() => {
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertStaticFileAccessible:jest.fn().mockResolvedValue(undefined)
        };
        const controller = createController(contentAccess);
        const response = createResponse();

        await controller.serveFiles(
            {user:{userId}, path:"/api/static/doujinshi/Serie/vol01/001.jpg"} as unknown as Request,
            response
        );

        expect(contentAccess.assertStaticFileAccessible).toHaveBeenCalledWith("doujinshi", "Serie", policy);
        expect(response.sendFile).toHaveBeenCalledWith(
            "/doujinshi/Serie/vol01/001.jpg",
            {root:"./../exterior"},
            expect.any(Function)
        );
    });

    it.each([
        {showMatureContent:false, seriesMatch:{isMature:{$ne:true}}},
        {showMatureContent:true, seriesMatch:{}}
    ] as ContentAccessPolicy[])("mantiene accesible contenido permitido con policy %p", async(activePolicy) => {
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(activePolicy),
            assertStaticFileAccessible:jest.fn().mockResolvedValue(undefined)
        };
        const controller = createController(contentAccess);
        const response = createResponse();

        await controller.serveFiles(
            {user:{userId}, path:"/api/static/mangas/Normal/cover.jpg"} as unknown as Request,
            response
        );

        expect(contentAccess.assertStaticFileAccessible).toHaveBeenCalledWith(
            "manga",
            "Normal",
            activePolicy
        );
        expect(response.sendFile).toHaveBeenCalledWith(
            "/mangas/Normal/cover.jpg",
            {root:"./../exterior"},
            expect.any(Function)
        );
    });

    it.each([
        "/api/static/mangas/Normal/../Madura/cover.jpg",
        "/api/static/mangas/Normal/%2E%2E/Madura/cover.jpg",
        "/api/static/mangas\\Normal\\cover.jpg"
    ])("rechaza path traversal o separadores manipulados: %s", async(path) => {
        const contentAccess = {forUser:jest.fn()};
        const controller = createController(contentAccess);
        const response = createResponse();

        await controller.serveFiles(
            {user:{userId}, path} as unknown as Request,
            response
        );

        expect(response.sendStatus).toHaveBeenCalledWith(404);
        expect(response.sendFile).not.toHaveBeenCalled();
        expect(contentAccess.forUser).not.toHaveBeenCalled();
    });
});
