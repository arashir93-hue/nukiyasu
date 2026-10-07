import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";

export type DoujinshiCollectionDocument = DoujinshiCollection & Document;

@Schema({collection: "doujinshi_collections"})
export class DoujinshiCollection {
    _id: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: User.name, required: true})
    user: Types.ObjectId;

    @Prop({type: String, required: true})
    name: string;

    @Prop({type: String, required: true})
    normalizedName: string;

    @Prop({type: Boolean, default: false})
    isFavorite: boolean;

    @Prop({type: Number, default: 0})
    sortOrder: number;

    @Prop({type: Date, default: () => new Date()})
    createdAt: Date;

    @Prop({type: Date, default: () => new Date()})
    updatedAt: Date;
}

export const DoujinshiCollectionSchema = SchemaFactory.createForClass(DoujinshiCollection);

DoujinshiCollectionSchema.index({user: 1, normalizedName: 1}, {unique: true});
DoujinshiCollectionSchema.index({user: 1, isFavorite: -1, sortOrder: 1, createdAt: 1});
