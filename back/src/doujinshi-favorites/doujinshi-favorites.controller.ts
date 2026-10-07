import {Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UnauthorizedException, UseGuards} from "@nestjs/common";
import {Request} from "express";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ContentAccessService} from "../content-access/content-access.service";
import {ParseObjectIdPipe} from "../validation/objectId";
import {BatchFavoriteStatusDto} from "./dto/batch-favorite-status.dto";
import {CreateDoujinshiCollectionDto} from "./dto/create-doujinshi-collection.dto";
import {FavoriteListQueryDto} from "./dto/favorite-list-query.dto";
import {UpdateDoujinshiCollectionDto} from "./dto/update-doujinshi-collection.dto";
import {DoujinshiCollectionsService} from "./doujinshi-collections.service";
import {DoujinshiFavoritesService} from "./doujinshi-favorites.service";

@Controller("doujinshi")
@UseGuards(JwtAuthGuard)
export class DoujinshiFavoritesController {
    constructor(
        private readonly favoritesService: DoujinshiFavoritesService,
        private readonly contentAccessService: ContentAccessService,
        private readonly collectionsService: DoujinshiCollectionsService
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

    @Get("collections")
    async listCollections(@Req() req: Request) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        return this.collectionsService.listCollections(userId, policy);
    }

    @Post("collections")
    async createCollection(
        @Req() req: Request,
        @Body() dto: CreateDoujinshiCollectionDto
    ) {
        return this.collectionsService.createCollection(this.getUserId(req), dto);
    }

    @Patch("collections/:collectionId")
    async updateCollection(
        @Req() req: Request,
        @Param("collectionId", ParseObjectIdPipe) collection: Types.ObjectId,
        @Body() dto: UpdateDoujinshiCollectionDto
    ) {
        return this.collectionsService.updateCollection(this.getUserId(req), collection, dto);
    }

    @Delete("collections/:collectionId")
    async deleteCollection(
        @Req() req: Request,
        @Param("collectionId", ParseObjectIdPipe) collection: Types.ObjectId
    ) {
        return this.collectionsService.deleteCollection(this.getUserId(req), collection);
    }

    @Get("collections/:collectionId/items")
    async listCollectionItems(
        @Req() req: Request,
        @Param("collectionId", ParseObjectIdPipe) collection: Types.ObjectId,
        @Query() query: FavoriteListQueryDto
    ) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        return this.collectionsService.listItems(userId, collection, policy, query.page || 1, query.limit || 24);
    }

    @Put("collections/:collectionId/items/:serieId")
    async addCollectionItem(
        @Req() req: Request,
        @Param("collectionId", ParseObjectIdPipe) collection: Types.ObjectId,
        @Param("serieId", ParseObjectIdPipe) serie: Types.ObjectId
    ) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        return this.collectionsService.addItem(userId, collection, serie, policy);
    }

    @Delete("collections/:collectionId/items/:serieId")
    async removeCollectionItem(
        @Req() req: Request,
        @Param("collectionId", ParseObjectIdPipe) collection: Types.ObjectId,
        @Param("serieId", ParseObjectIdPipe) serie: Types.ObjectId
    ) {
        return this.collectionsService.removeItem(this.getUserId(req), collection, serie);
    }

    @Post("organization/batch")
    async batchStatus(@Req() req: Request, @Body() body: BatchFavoriteStatusDto) {
        const userId = this.getUserId(req);
        const policy = await this.contentAccessService.forUser(userId);
        const serieIds = [...new Map(
            body.serieIds.map(id => [id, new Types.ObjectId(id)])
        ).values()];
        const favoriteItems = await this.favoritesService.batchStatus(userId, serieIds, policy);
        const collectionItems = await this.collectionsService.batchCollectionStatus(userId, serieIds, policy);
        const items: Record<string, {isFavorite: boolean; collectionIds: string[]}> = {};

        for (const serieId of serieIds) {
            const key = serieId.toString();
            items[key] = {
                isFavorite: favoriteItems[key]?.isFavorite === true,
                collectionIds: collectionItems[key]?.collectionIds || []
            };
        }

        return {items};
    }
}
