import {Injectable, NotFoundException, UnauthorizedException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {FilterQuery, Model, Types} from "mongoose";
import {Serie, SerieDocument} from "../series/schemas/series.schema";
import {UsersService} from "../users/users.service";

export interface ContentAccessPolicy {
    showMatureContent:boolean;
    seriesMatch:FilterQuery<Serie>;
}

@Injectable()
export class ContentAccessService {
    constructor(
        private readonly usersService:UsersService,
        @InjectModel(Serie.name) private readonly seriesModel:Model<SerieDocument>
    ) {}

    async forUser(userId:Types.ObjectId):Promise<ContentAccessPolicy> {
        const user = await this.usersService.findById(userId);

        if (!user) throw new UnauthorizedException();

        const showMatureContent = user.showMatureContent === true;

        return {
            showMatureContent,
            seriesMatch:showMatureContent ? {} : {isMature:{$ne:true}}
        };
    }

    async assertSeriesAccessible(
        serieId:Types.ObjectId,
        policy:ContentAccessPolicy
    ):Promise<void> {
        if (policy.showMatureContent) return;

        const accessibleSerie = await this.seriesModel.exists({
            _id:new Types.ObjectId(serieId),
            ...policy.seriesMatch
        });

        if (!accessibleSerie) throw new NotFoundException();
    }

    forJoinedSeries(
        alias:string,
        policy:ContentAccessPolicy
    ):Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(policy.seriesMatch).map(([field, condition]) => [
                `${alias}.${field}`,
                condition
            ])
        );
    }
}
