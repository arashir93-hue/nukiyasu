import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";
import {Book} from "../../books/schemas/book.schema";
import {ReadProgress} from "../../readprogress/schemas/readprogress.schema";

export type NihongoTrackerLogDocument = NihongoTrackerLog & Document;

@Schema({timestamps:true})
export class NihongoTrackerLog {
    _id?: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:User.name, required:true})
    user: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:Book.name, required:true})
    book: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:ReadProgress.name, required:true})
    progress: Types.ObjectId;

    @Prop({type:String})
    externalLogId?: string;
}

export const NihongoTrackerLogSchema = SchemaFactory.createForClass(NihongoTrackerLog);
NihongoTrackerLogSchema.index({user:1, progress:1}, {unique:true});
