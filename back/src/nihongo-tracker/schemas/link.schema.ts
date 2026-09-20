import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";
import {Serie} from "../../series/schemas/series.schema";

export type NihongoTrackerLinkDocument = NihongoTrackerLink & Document;

@Schema({timestamps:true})
export class NihongoTrackerLink {
    _id?: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:User.name, required:true})
    user: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:Serie.name, required:true})
    serie: Types.ObjectId;

    @Prop({type:String, enum:["manga", "light-novel"], required:true})
    mediaType: "manga" | "light-novel";

    @Prop({type:String, required:true})
    mediaId: string;

    @Prop({type:String, required:false})
    mediaTitle?: string;
}

export const NihongoTrackerLinkSchema = SchemaFactory.createForClass(NihongoTrackerLink);
NihongoTrackerLinkSchema.index({user:1, serie:1}, {unique:true});
