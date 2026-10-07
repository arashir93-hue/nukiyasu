import {Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UnauthorizedException, UseGuards} from "@nestjs/common";
import {Request} from "express";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ContentAccessService} from "../content-access/content-access.service";
import {ParseObjectIdPipe} from "../validation/objectId";
import {BatchFavoriteStatusDto} from "./dto/batch-favorite-status.dto";
import {FavoriteListQueryDto} from "./dto/favorite-list-query.dto";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";

@Controller("doujinshi")
@UseGuards(JwtAuthGuard)
export class DoujinshiFavoritesController {
    constructor(
        private readonly favoritesService: DoujinshiFavoritesService,
        private readonly contentAccessService: ContentAccessService
    ) {}

    private getUserId(req: Request): Types.ObjectId {
        if (!req.user) throw new UnauthorizedException();
        return (req.user as {userId: Types.ObjectId}).userId;
    }

    @Get("favorites")
    async listFavorites(@Req() req: Request, @Query() query: FavoriteListQueryDto) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        return this.favoritesService.listFavorites(
            userId,
            policy,
            query.page || 1,
            query.limit || 24
        );
    }

    @Put("series/:serieId/favorite")
    async addFavorite(
        @Req() req: Request,
        @Param("serieId", ParseObjectIdPipe) serie: Types.ObjectId
    ) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        return this.favoritesService.addFavorite(userId, serie, policy);
    }

    @Delete("series/:serieId/favorite")
    async removeFavorite(
        @Req() req: Request,
        @Param("serieId", ParseObjectIdPipe) serie: Types.ObjectId
    ) {
        return this.favoritesService.removeFavorite(this.getUserId(req), serie);
    }

    @Post("organization/batch")
    async batchStatus(@Req() req: Request, @Body() body: BatchFavoriteStatusDto) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        const serieIds = [...new Map(
            body.serieIds.map(id => [id, new Types.ObjectId(id)])
        ).values()];
        return {items: await this.favoritesService.batchStatus(userId, serieIds, policy)};
    }
}
