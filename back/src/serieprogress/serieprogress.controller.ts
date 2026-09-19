import {ApiTags} from "@nestjs/swagger";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {Controller, Param, Post, Req, UnauthorizedException, UseGuards} from "@nestjs/common";
import {SerieprogressService} from "./serieprogress.service";
import {Request} from "express";
import {ParseObjectIdPipe} from "../validation/objectId";
import {Types} from "mongoose";
import {ContentAccessService} from "../content-access/content-access.service";

@Controller("serieprogress")
@UseGuards(JwtAuthGuard)
@ApiTags("Series")
export class SerieProgressController {
    constructor(
        private readonly serieProgressService:SerieprogressService,
        private readonly contentAccessService:ContentAccessService
    ) {}

    @Post("pause/:serieId")
    async pauseSerie(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serieId, policy);

        return this.serieProgressService.pauseSerie(userId, serieId);
    }

    @Post("resume/:serieId")
    async resumeSerie(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serieId, policy);

        return this.serieProgressService.resumeSerie(userId, serieId);
    }
}
