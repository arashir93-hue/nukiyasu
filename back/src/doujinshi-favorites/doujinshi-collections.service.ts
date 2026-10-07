import {BadRequestException, ConflictException, Injectable, NotFoundException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {Model, Types} from "mongoose";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";
import {Serie, SerieDocument} from "../series/schemas/series.schema";
import {CreateDoujinshiCollectionDto} from "./dto/create-doujinshi-collection.dto";
import {UpdateDoujinshiCollectionDto} from "./dto/update-doujinshi-collection.dto";
import {DoujinshiCollection, DoujinshiCollectionDocument} from "./schemas/doujinshi-collection.schema";
import {DoujinshiCollectionItem, DoujinshiCollectionItemDocument} from "./schemas/doujinshi-collection-item.schema";
import {serieCoverStages} from "../series/helpers/serie-cover-stages";

export interface CollectionItemStatus {
    isInCollection: boolean;
}

export interface CollectionOrganizationStatus {
    collectionIds: string[];
}

@Injectable()
export class DoujinshiCollectionsService {
    constructor(
        @InjectModel(DoujinshiCollection.name)
        private readonly collectionModel: Model<DoujinshiCollectionDocument>,
        @InjectModel(DoujinshiCollectionItem.name)
        private readonly itemModel: Model<DoujinshiCollectionItemDocument>,
        @InjectModel(Serie.name)
        private readonly seriesModel: Model<SerieDocument>,
        private readonly contentAccessService: ContentAccessService
    ) {}

    private normalizeName(name: string): string {
        return name
            .trim()
            .normalize("NFKC")
            .replace(/\s+/gu, " ")
            .toLowerCase();
    }

    private validateName(name: string): string {
        const trimmedName = name.trim();
        if (trimmedName.length < 1 || trimmedName.length > 80) {
            throw new BadRequestException("El nombre debe tener entre 1 y 80 caracteres");
        }
        return trimmedName;
    }

    private validateSortOrder(sortOrder: number): void {
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000000) {
            throw new BadRequestException("sortOrder debe ser un entero entre 0 y 1000000");
        }
    }

    private async findOwnedCollection(user: Types.ObjectId, collection: Types.ObjectId) {
        const found = await this.collectionModel.findOne({_id: collection, user});
        if (!found) throw new NotFoundException();
        return found;
    }

    private isDuplicateKey(error: unknown): boolean {
        return (error as {code?: number})?.code === 11000;
    }

    async createCollection(
        user: Types.ObjectId,
        dto: CreateDoujinshiCollectionDto
    ) {
        const name = this.validateName(dto.name);
        const normalizedName = this.normalizeName(name);

        try {
            return await this.collectionModel.create({
                user,
                name,
                normalizedName,
                isFavorite: false,
                sortOrder: 0
            });
        } catch (error) {
            if (this.isDuplicateKey(error)) {
                throw new ConflictException("Ya existe una colección con ese nombre");
            }
            throw error;
        }
    }

    async listCollections(user: Types.ObjectId, policy: ContentAccessPolicy) {
        const joinedSeriesPolicy = this.contentAccessService.forJoinedSeries("serieInfo", policy);
        const collections = await this.collectionModel.aggregate([
            {$match: {user: new Types.ObjectId(user)}},
            {$lookup: {
                from: "doujinshi_collection_items",
                let: {collectionId: "$_id", userId: new Types.ObjectId(user)},
                as: "visibleItems",
                pipeline: [
                    {$match: {$expr: {$and: [
                        {$eq: ["$collection", "$$collectionId"]},
                        {$eq: ["$user", "$$userId"]}
                    ]}}},
                    {$lookup: {
                        from: "series",
                        localField: "serie",
                        foreignField: "_id",
                        as: "serieInfo"
                    }},
                    {$unwind: {path: "$serieInfo"}},
                    {$match: {
                        ...joinedSeriesPolicy,
                        "serieInfo.variant": "doujinshi"
                    }},
                    {$count: "total"}
                ]
            }},
            {$addFields: {
                visibleItemCount: {$ifNull: [{$arrayElemAt: ["$visibleItems.total", 0]}, 0]}
            }},
            {$project: {visibleItems: 0}},
            {$sort: {isFavorite: -1, sortOrder: 1, createdAt: 1, _id: 1}}
        ]);

        return collections;
    }

    async updateCollection(
        user: Types.ObjectId,
        collection: Types.ObjectId,
        dto: UpdateDoujinshiCollectionDto
    ) {
        await this.findOwnedCollection(user, collection);

        const update: Record<string, unknown> = {updatedAt: new Date()};
        if (dto.name !== undefined) {
            const name = this.validateName(dto.name);
            update.name = name;
            update.normalizedName = this.normalizeName(name);
        }
        if (dto.isFavorite !== undefined) update.isFavorite = dto.isFavorite;
        if (dto.sortOrder !== undefined) {
            this.validateSortOrder(dto.sortOrder);
            update.sortOrder = dto.sortOrder;
        }

        try {
            const updated = await this.collectionModel.findOneAndUpdate(
                {_id: collection, user},
                {$set: update},
                {new: true}
            );
            if (!updated) throw new NotFoundException();
            return updated;
        } catch (error) {
            if (this.isDuplicateKey(error)) {
                throw new ConflictException("Ya existe una colección con ese nombre");
            }
            throw error;
        }
    }

    async deleteCollection(user: Types.ObjectId, collection: Types.ObjectId) {
        await this.findOwnedCollection(user, collection);
        await this.itemModel.deleteMany({user, collection});
        await this.collectionModel.deleteOne({_id: collection, user});
        return {status: "OK"};
    }

    private async assertAccessibleDoujinshi(
        serie: Types.ObjectId,
        policy: ContentAccessPolicy
    ): Promise<void> {
        const found = await this.seriesModel.exists({
            _id: serie,
            variant: "doujinshi",
            ...policy.seriesMatch
        });
        if (!found) throw new NotFoundException();
    }

    async addItem(
        user: Types.ObjectId,
        collection: Types.ObjectId,
        serie: Types.ObjectId,
        policy: ContentAccessPolicy
    ): Promise<CollectionItemStatus> {
        await this.findOwnedCollection(user, collection);
        await this.assertAccessibleDoujinshi(serie, policy);

        try {
            await this.itemModel.findOneAndUpdate(
                {user, collection, serie},
                {$setOnInsert: {user, collection, serie}},
                {upsert: true, new: true, setDefaultsOnInsert: true}
            );
        } catch (error) {
            if (!this.isDuplicateKey(error)) throw error;
            const existing = await this.itemModel.findOne({user, collection, serie});
            if (!existing) throw error;
        }
        return {isInCollection: true};
    }

    async removeItem(
        user: Types.ObjectId,
        collection: Types.ObjectId,
        serie: Types.ObjectId
    ): Promise<CollectionItemStatus> {
        await this.findOwnedCollection(user, collection);
        await this.itemModel.deleteOne({user, collection, serie});
        return {isInCollection: false};
    }

    async listItems(
        user: Types.ObjectId,
        collection: Types.ObjectId,
        policy: ContentAccessPolicy,
        page = 1,
        limit = 24
    ) {
        await this.findOwnedCollection(user, collection);
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(limit, 100));
        const basePipeline = [
            {$match: {user: new Types.ObjectId(user), collection}},
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
        const countResult = await this.itemModel.aggregate([
            ...basePipeline,
            {$count: "total"}
        ]);
        const data = await this.itemModel.aggregate([
            ...basePipeline,
            {$sort: {addedAt: -1, _id: -1}},
            {$skip: (safePage - 1) * safeLimit},
            {$limit: safeLimit},
            {$replaceRoot: {newRoot: "$serieInfo"}},
            ...serieCoverStages()
        ]);
        const total = countResult[0]?.total || 0;
        return {data, pages: Math.ceil(total / safeLimit)};
    }

    async batchCollectionStatus(
        user: Types.ObjectId,
        serieIds: Types.ObjectId[],
        policy: ContentAccessPolicy
    ): Promise<Record<string, CollectionOrganizationStatus>> {
        const uniqueIds = [...new Map(serieIds.map(id => [id.toString(), id])).values()];
        const result: Record<string, CollectionOrganizationStatus> = {};
        for (const id of uniqueIds) result[id.toString()] = {collectionIds: []};
        if (uniqueIds.length === 0) return result;

        const visiblePolicy = this.contentAccessService.forJoinedSeries("serieInfo", policy);
        const rows = await this.itemModel.aggregate([
            {$match: {user: new Types.ObjectId(user), serie: {$in: uniqueIds}}},
            {$lookup: {
                from: "doujinshi_collections",
                localField: "collection",
                foreignField: "_id",
                as: "collectionInfo"
            }},
            {$unwind: {path: "$collectionInfo"}},
            {$match: {"collectionInfo.user": new Types.ObjectId(user)}},
            {$lookup: {
                from: "series",
                localField: "serie",
                foreignField: "_id",
                as: "serieInfo"
            }},
            {$unwind: {path: "$serieInfo"}},
            {$match: {
                ...visiblePolicy,
                "serieInfo.variant": "doujinshi"
            }},
            {$project: {_id: 0, serie: 1, collection: 1}},
            {$sort: {serie: 1, collection: 1}}
        ]);

        for (const row of rows) {
            const serieId = row.serie.toString();
            const collectionId = row.collection.toString();
            if (!result[serieId].collectionIds.includes(collectionId)) {
                result[serieId].collectionIds.push(collectionId);
            }
        }
        return result;
    }
}
