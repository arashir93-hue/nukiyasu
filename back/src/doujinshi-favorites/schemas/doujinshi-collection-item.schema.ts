import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";
import {Serie} from "../../series/schemas/series.schema";
import {DoujinshiCollection} from "./doujinshi-collection.schema";

export type DoujinshiCollectionItemDocument = DoujinshiCollectionItem & Document;

@Schema({collection: "doujinshi_collection_items", suppressReservedKeysWarning: true})
export class DoujinshiCollectionItem {
    _id: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: User.name, required: true})
    user: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: DoujinshiCollection.name, required: true})
    collection: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: Serie.name, required: true})
    serie: Types.ObjectId;

    @Prop({type: Date, default: () => new Date()})
    addedAt: Date;
}

export const DoujinshiCollectionItemSchema = SchemaFactory.createForClass(DoujinshiCollectionItem);

DoujinshiCollectionItemSchema.index({collection: 1, serie: 1}, {unique: true});
DoujinshiCollectionItemSchema.index({user: 1, serie: 1});
DoujinshiCollectionItemSchema.index({collection: 1, addedAt: -1});
DoujinshiCollectionItemSchema.index({serie: 1});
