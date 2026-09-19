import {ExecutionContext, INestApplication, ValidationPipe} from "@nestjs/common";
import {APP_PIPE} from "@nestjs/core";
import {Test} from "@nestjs/testing";
import {Types} from "mongoose";
import * as request from "supertest";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {TokensService} from "../tokens/tokens.service";
import {UsersController} from "./users.controller";
import {UsersService} from "./users.service";

describe("UsersController mature content preference", () => {
    let app:INestApplication;
    let usersService: {updateMatureContentPreference: jest.Mock};
    const authenticatedUserId = new Types.ObjectId();

    beforeEach(async() => {
        usersService = {
            updateMatureContentPreference:jest.fn()
        };

        const moduleRef = await Test.createTestingModule({
            controllers:[UsersController],
            providers:[
                {provide:UsersService, useValue:usersService},
                {provide:TokensService, useValue:{}},
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

    it.each([true, false])(
        "actualiza únicamente la preferencia del usuario autenticado a %p",
        async(showMatureContent) => {
            const otherUserId = new Types.ObjectId();
            usersService.updateMatureContentPreference.mockResolvedValue(showMatureContent);

            await request(app.getHttpServer())
                .patch("/api/users/preferences/mature-content")
                .send({showMatureContent, userId:otherUserId.toString()})
                .expect(200)
                .expect({showMatureContent});

            expect(usersService.updateMatureContentPreference).toHaveBeenCalledWith(
                authenticatedUserId,
                showMatureContent
            );
        }
    );

    it.each(["true", 1, null, undefined])(
        "rechaza showMatureContent no booleano: %p",
        async(invalidValue) => {
            await request(app.getHttpServer())
                .patch("/api/users/preferences/mature-content")
                .send({showMatureContent:invalidValue})
                .expect(400);

            expect(usersService.updateMatureContentPreference).not.toHaveBeenCalled();
        }
    );
});
