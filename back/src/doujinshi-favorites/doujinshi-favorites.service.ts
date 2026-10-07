import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {Serie, SerieDocument} from "../series/schemas/series.schema";
import {DoujinshiFavorite, DoujinshiFavoriteDocument} from "./schemas/doujinshi-favorite.schema";
import {serieCoverStages} from "../series/helpers/serie-cover-stages";

export interface FavoriteStatus {
    isFavorite: boolean;
}

export interface FavoriteListPage {
    data: Serie[];
    pages: number;
}

@Injectable()
export class DoujinshiFavoritesService {
    constructor(
        @InjectModel(DoujinshiFavorite.name)
        private readonly favoriteModel: Model<DoujinshiFavoriteDocument>,
        @InjectModel(Serie.name)
        private readonly seriesModel: Model<SerieDocument>,
        private readonly contentAccessService: ContentAccessService
    ) {}

    private async assertAccessibleDoujinshi(
        serie: Types.ObjectId,
        policy: ContentAccessPolicy
    ): Promise<void> {
        const foundSerie = await this.seriesModel.exists({
            _id: serie,
            variant: "doujinshi",
            ...policy.seriesMatch
        });

        if (!foundSerie) throw new NotFoundException();
    }

    async addFavorite(
        user: Types.ObjectId,
        serie: Types.ObjectId,
        policy: ContentAccessPolicy
    ): Promise<FavoriteStatus> {
        await this.assertAccessibleDoujinshi(serie, policy);

        try {
            await this.favoriteModel.findOneAndUpdate(
                {user, serie},
                {$setOnInsert: {user, serie}},
                {upsert: true, new: true, setDefaultsOnInsert: true}
            );
        } catch (error) {
            // El índice único cubre una carrera entre dos PUT simultáneos.
            if ((error as {code?: number})?.code !== 11000) throw error;
        }

        return {isFavorite: true};
    }

    async removeFavorite(user: Types.ObjectId, serie: Types.ObjectId): Promise<FavoriteStatus> {
        // La eliminación es deliberadamente idempotente y permite retirar un favorito maduro oculto.
        await this.favoriteModel.deleteOne({user, serie});
        return {isFavorite: false};
    }

    async listFavorites(
        user: Types.ObjectId,
        policy: ContentAccessPolicy,
        page = 1,
        limit = 24
    ): Promise<FavoriteListPage> {
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 100));
        const basePipeline = [
            {$match: {user: new Types.ObjectId(user)}},
            {$lookup: {
                from: "series",
                localField: "serie",
                foreignField: "_id",
                as: "serieInfo"
            }},
            {$unwind: {path: "$serieInfo"}},
            {$match: {
                ...this.contentAccessService.forJoinedSeries("serieInfo", policy),
                "serieInfo.variant": "doujinshi"
            }}
        ];

        const countResult = await this.favoriteModel.aggregate([
            ...basePipeline,
            {$count: "total"}
        ]);

        const data = await this.favoriteModel.aggregate([
            ...basePipeline,
            {$sort: {createdAt: -1, _id: -1}},
            {$skip: (safePage - 1) * safeLimit},
            {$limit: safeLimit},
            {$replaceRoot: {newRoot: "$serieInfo"}},
            ...serieCoverStages()
        ]);

        const total = countResult[0]?.total || 0;
        return {data: data as Serie[], pages: Math.ceil(total / safeLimit)};
    }

    async batchStatus(
        user: Types.ObjectId,
        serieIds: Types.ObjectId[],
        policy: ContentAccessPolicy
    ): Promise<Record<string, FavoriteStatus>> {
        const uniqueIds = [...new Map(serieIds.map(id => [id.toString(), id])).values()];
        const result: Record<string, FavoriteStatus> = {};

        for (const id of uniqueIds) {
            result[id.toString()] = {isFavorite: false};
        }

        if (uniqueIds.length === 0) return result;

        const accessibleSeries = await this.seriesModel.find(
            {
                _id: {$in: uniqueIds},
                variant: "doujinshi",
                ...policy.seriesMatch
            },
            {_id: 1}
        );
        const accessibleIds = accessibleSeries.map(serie => serie._id);

        if (accessibleIds.length === 0) return result;

        const favorites = await this.favoriteModel.find({
            user,
            serie: {$in: accessibleIds}
        }, {serie: 1});

        for (const favorite of favorites) {
            result[favorite.serie.toString()] = {isFavorite: true};
        }

        return result;
    }
}
