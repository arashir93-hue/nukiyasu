import {NotFoundException} from "@nestjs/common";
import {Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {SeriesService} from "../series/series.service";
import {ReviewsController} from "./reviews.controller";
import {ReviewsService} from "./reviews.service";

describe("Reviews mature visibility", () => {
    const userId = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const reviewId = new Types.ObjectId();
    const policy:ContentAccessPolicy = {
        showMatureContent:false,
        seriesMatch:{isMature:{$ne:true}}
    };

    it("no crea ni modifica reviews de una serie oculta", async() => {
        const reviewsService = {
            create:jest.fn(),
            findById:jest.fn().mockResolvedValue({serie:serieId}),
            editReview:jest.fn()
        };
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(policy),
            assertSeriesAccessible:jest.fn().mockRejectedValue(new NotFoundException())
        };
        const controller = new ReviewsController(
            reviewsService as unknown as ReviewsService,
            {} as SeriesService,
            contentAccess as unknown as ContentAccessService
        );
        const request = {user:{userId}} as never;
        const createDto = {serie:serieId, userLevel:"N3" as const, difficulty:3, valoration:5};

        await expect(controller.create(request, createDto)).rejects.toBeInstanceOf(NotFoundException);
        await expect(controller.edit(request, reviewId, {comment:"oculta"})).rejects.toBeInstanceOf(NotFoundException);
        expect(reviewsService.create).not.toHaveBeenCalled();
        expect(reviewsService.editReview).not.toHaveBeenCalled();
    });

    it("con la preferencia activa mantiene la creación existente", async() => {
        const allPolicy:ContentAccessPolicy = {showMatureContent:true, seriesMatch:{}};
        const reviewsService = {
            create:jest.fn().mockResolvedValue({serie:serieId}),
            getSerieDifficulty:jest.fn().mockResolvedValue(3),
            getSerieValoration:jest.fn().mockResolvedValue(5)
        };
        const contentAccess = {
            forUser:jest.fn().mockResolvedValue(allPolicy),
            assertSeriesAccessible:jest.fn().mockResolvedValue(undefined)
        };
        const controller = new ReviewsController(
            reviewsService as unknown as ReviewsService,
            {editSerie:jest.fn()} as unknown as SeriesService,
            contentAccess as unknown as ContentAccessService
        );

        await controller.create(
            {user:{userId}} as never,
            {serie:serieId, userLevel:"N3", difficulty:3, valoration:5}
        );

        expect(reviewsService.create).toHaveBeenCalled();
    });
});
