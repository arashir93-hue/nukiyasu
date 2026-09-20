import {Prop, Schema, SchemaFactory} from "@nestjs/mongoose";
import {Document, SchemaTypes, Types} from "mongoose";
import {User} from "../../users/schemas/user.schema";

export type NihongoTrackerIntegrationDocument = NihongoTrackerIntegration & Document;

@Schema({timestamps:true})
export class NihongoTrackerIntegration {
    _id?: Types.ObjectId;

    @Prop({type:SchemaTypes.ObjectId, ref:User.name, required:true, unique:true})
    user: Types.ObjectId;

    /** AES-256-GCM payload. Nunca se devuelve a los clientes. */
    @Prop({type:String, required:true})
    encryptedApiKey: string;

    /** Prefijo no sensible para mostrar el estado de la conexión. */
    @Prop({type:String, required:true})
    keyPrefix: string;
}

export const NihongoTrackerIntegrationSchema = SchemaFactory.createForClass(NihongoTrackerIntegration);
NihongoTrackerIntegrationSchema.index({user:1}, {unique:true});
