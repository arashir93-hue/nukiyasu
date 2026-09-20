import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {Book} from "../../books/schemas/book.schema";
import {User} from "../../users/schemas/user.schema";

export type NihongoTrackerBookOverrideDocument = NihongoTrackerBookOverride & Document;

/** Per-user integration metadata, kept separate from the general Book model. */
@Schema({timestamps:true})
export class NihongoTrackerBookOverride {
    _id?: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:User.name, required:true})
    user: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:Book.name, required:true})
    book: Types.ObjectId;

    @Prop({type:Number, required:true, min:0.01})
    volumeNumber: number;
}

export const NihongoTrackerBookOverrideSchema = SchemaFactory.createForClass(NihongoTrackerBookOverride);
NihongoTrackerBookOverrideSchema.index({user:1, book:1}, {unique:true});
