import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";
import {Serie} from "../../series/schemas/series.schema";

export type DoujinshiFavoriteDocument = DoujinshiFavorite & Document;

@Schema()
export class DoujinshiFavorite {
    _id: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: User.name, required: true})
    user: Types.ObjectId;

    @Prop({type: SchemaTypes.ObjectId, ref: Serie.name, required: true})
    serie: Types.ObjectId;

    @Prop({type: Date, default: () => new Date()})
    createdAt: Date;
}

export const DoujinshiFavoriteSchema = SchemaFactory.createForClass(DoujinshiFavorite);

DoujinshiFavoriteSchema.index({user: 1, serie: 1}, {unique: true});
DoujinshiFavoriteSchema.index({user: 1, createdAt: -1});
DoujinshiFavoriteSchema.index({serie: 1});
