import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";
import {Serie} from "../../series/schemas/series.schema";

export type NihongoTrackerLinkDocument = NihongoTrackerLink & Document;

export type NihongoTrackerLinkMode = "linked" | "manual";

@Schema({timestamps:true})
export class NihongoTrackerLink {
    _id?: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:User.name, required:true})
    user: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:Serie.name, required:true})
    serie: Types.ObjectId;

    /** Explicitly distinguishes an external media link from a free-title log. */
    @Prop({type:String, enum:["linked", "manual"], default:"linked"})
    mode: NihongoTrackerLinkMode;

    @Prop({type:String, enum:["manga", "light-novel"], required:true})
    mediaType: "manga" | "light-novel";

    /** Empty for manual targets. Historical linked documents keep their id. */
    @Prop({type:String, required:false})
    mediaId?: string;

    @Prop({type:String, required:false})
    mediaTitle?: string;
}

export const NihongoTrackerLinkSchema = SchemaFactory.createForClass(NihongoTrackerLink);
NihongoTrackerLinkSchema.index({user:1, serie:1}, {unique:true});
