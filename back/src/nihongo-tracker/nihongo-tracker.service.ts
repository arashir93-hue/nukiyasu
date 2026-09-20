import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    NotFoundException
} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {InjectModel} from "@nestjs/mongoose";
import {Model, Types} from "mongoose";
import {ContentAccessService} from "../content-access/content-access.service";
import {Book, BookDocument} from "../books/schemas/book.schema";
import {ReadProgress, ReadProgressDocument} from "../readprogress/schemas/readprogress.schema";
import {Serie, SerieDocument} from "../series/schemas/series.schema";
import {ConnectNihongoTrackerDto} from "./dto/connect.dto";
import {LinkNihongoTrackerDto} from "./dto/link.dto";
import {SearchNihongoTrackerDto} from "./dto/search.dto";
import {decryptNihongoTrackerKey, encryptNihongoTrackerKey} from "./crypto";
import {NihongoTrackerIntegration, NihongoTrackerIntegrationDocument} from "./schemas/integration.schema";
import {NihongoTrackerLink, NihongoTrackerLinkDocument} from "./schemas/link.schema";
import {NihongoTrackerLog, NihongoTrackerLogDocument} from "./schemas/log.schema";

type MediaType = "manga" | "light-novel";

@Injectable()
export class NihongoTrackerService {
    private readonly baseUrl: string;

    constructor(
        @InjectModel(NihongoTrackerIntegration.name)
        private readonly integrationModel: Model<NihongoTrackerIntegrationDocument>,
        @InjectModel(NihongoTrackerLink.name)
        private readonly linkModel: Model<NihongoTrackerLinkDocument>,
        @InjectModel(NihongoTrackerLog.name)
        private readonly logModel: Model<NihongoTrackerLogDocument>,
        @InjectModel(Serie.name)
        private readonly serieModel: Model<SerieDocument>,
        @InjectModel(Book.name)
        private readonly bookModel: Model<BookDocument>,
        @InjectModel(ReadProgress.name)
        private readonly progressModel: Model<ReadProgressDocument>,
        private readonly contentAccessService: ContentAccessService,
        private readonly configService: ConfigService
    ) {
        this.baseUrl = (this.configService.get<string>("NIHONGO_TRACKER_URL") || "https://nihongotracker.app/api").replace(/\/$/, "");
    }

    private async integrationFor(user: Types.ObjectId): Promise<NihongoTrackerIntegrationDocument> {
        const integration = await this.integrationModel.findOne({user});
        if (!integration) throw new BadRequestException("Conecta primero tu cuenta de NihongoTracker");
        return integration;
    }

    private async requestExternal<T>(apiKey: string, endpoint: string, init?: RequestInit): Promise<T> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...init,
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "X-API-Key": apiKey,
                    ...(init?.headers || {})
                },
                signal: AbortSignal.timeout(15000)
            });
        } catch {
            throw new BadGatewayException("No se pudo contactar con NihongoTracker");
        }

        const text = await response.text();
        let body: unknown = undefined;
        try {
            body = text ? JSON.parse(text) : undefined;
        } catch {
            body = undefined;
        }

        if (!response.ok) {
            const message = typeof body === "object" && body !== null && "message" in body
                ? String((body as {message: unknown}).message)
                : `NihongoTracker respondió ${response.status}`;
            throw new BadGatewayException(message);
        }

        return body as T;
    }

    private async keyFor(integration: NihongoTrackerIntegrationDocument): Promise<string> {
        return decryptNihongoTrackerKey(this.configService, integration.encryptedApiKey);
    }

    async connect(user: Types.ObjectId, dto: ConnectNihongoTrackerDto) {
        await this.requestExternal<unknown>(dto.apiKey, "/auth/verify");

        await this.integrationModel.findOneAndUpdate(
            {user},
            {
                user,
                encryptedApiKey: encryptNihongoTrackerKey(this.configService, dto.apiKey),
                keyPrefix: dto.apiKey.slice(0, 8)
            },
            {upsert:true, new:true, setDefaultsOnInsert:true}
        );

        return this.status(user);
    }

    async disconnect(user: Types.ObjectId) {
        await this.integrationModel.deleteOne({user});
        return {connected:false};
    }

    async status(user: Types.ObjectId) {
        const integration = await this.integrationModel.findOne({user}, {keyPrefix:1});
        const linkedSeries = await this.linkModel.countDocuments({user});
        return {
            connected:!!integration,
            keyPrefix:integration?.keyPrefix,
            linkedSeries
        };
    }

    async search(user: Types.ObjectId, dto: SearchNihongoTrackerDto) {
        const integration = await this.integrationFor(user);
        const params = new URLSearchParams({search:dto.search, type:dto.type});
        if (dto.page !== undefined) params.set("page", String(dto.page));
        if (dto.perPage !== undefined) params.set("perPage", String(dto.perPage));

        return this.requestExternal<unknown>(await this.keyFor(integration), `/media/search?${params.toString()}`);
    }

    private async accessibleSerie(user: Types.ObjectId, serieId: Types.ObjectId): Promise<SerieDocument> {
        const policy = await this.contentAccessService.forUser(user);
        const serie = await this.serieModel.findOne({_id:serieId, ...policy.seriesMatch});
        if (!serie) throw new NotFoundException();
        return serie;
    }

    async getLink(user: Types.ObjectId, serieId: Types.ObjectId) {
        await this.accessibleSerie(user, serieId);
        const link = await this.linkModel.findOne({user, serie:serieId}, {_id:0, user:0, createdAt:0, updatedAt:0});
        return link || null;
    }

    async link(user: Types.ObjectId, serieId: Types.ObjectId, dto: LinkNihongoTrackerDto) {
        const serie = await this.accessibleSerie(user, serieId);
        const expectedType: MediaType = serie.variant === "novela" ? "light-novel" : "manga";
        if (dto.mediaType !== expectedType) {
            throw new BadRequestException("El tipo de medio no coincide con la serie");
        }

        const integration = await this.integrationFor(user);
        await this.requestExternal<unknown>(
            await this.keyFor(integration),
            `/media/${dto.mediaType}/${encodeURIComponent(dto.mediaId)}`
        );

        return this.linkModel.findOneAndUpdate(
            {user, serie:serieId},
            {
                user,
                serie:serieId,
                mediaType:dto.mediaType,
                mediaId:dto.mediaId,
                mediaTitle:dto.mediaTitle || serie.visibleName
            },
            {upsert:true, new:true, setDefaultsOnInsert:true}
        ).select({_id:0, user:0, createdAt:0, updatedAt:0});
    }

    async logBook(user: Types.ObjectId, bookId: Types.ObjectId) {
        const policy = await this.contentAccessService.forUser(user);
        const book = await this.bookModel.findById(bookId);
        if (!book) throw new NotFoundException();

        const serie = await this.serieModel.findOne({_id:book.serie, ...policy.seriesMatch});
        if (!serie) throw new NotFoundException();

        const link = await this.linkModel.findOne({user, serie:book.serie});
        if (!link) throw new BadRequestException("Vincula primero la serie con NihongoTracker");

        const progress = await this.progressModel.findOne({user, book:bookId, status:"completed"}).sort({endDate:-1, lastUpdateDate:-1});
        if (!progress?._id) throw new BadRequestException("El volumen todavía no está marcado como terminado");

        const previous = await this.logModel.findOne({user, progress:progress._id});
        if (previous) {
            return {status:"already_logged", externalLogId:previous.externalLogId};
        }

        const books = await this.bookModel.find({serie:book.serie, variant:book.variant}).sort({sortName:1, _id:1});
        const volume = Math.max(1, books.findIndex((item) => item._id?.equals(bookId)) + 1);
        const integration = await this.integrationFor(user);
        const payload = {
            type:link.mediaType,
            mediaId:link.mediaId,
            description:serie.visibleName,
            volume,
            // En manga el progreso guarda los caracteres de la página actual;
            // al terminar el tomo, los metadatos del libro representan el total.
            pages:book.variant === "manga" || book.mokured ? book.pages : undefined,
            chars:book.characters || progress.characters || 0,
            time:Math.max(0, Math.round((progress.time || 0) / 60)),
            date:(progress.endDate || progress.lastUpdateDate || new Date()).toISOString()
        };

        const external = await this.requestExternal<Record<string, unknown>>(
            await this.keyFor(integration),
            "/logs",
            {method:"POST", body:JSON.stringify(payload)}
        );

        const externalLogId = typeof external._id === "string"
            ? external._id
            : typeof external.id === "string" ? external.id : undefined;

        try {
            await this.logModel.create({user, book:bookId, progress:progress._id, externalLogId});
        } catch (error) {
            if (!String(error).includes("duplicate") && !String(error).includes("E11000")) throw error;
        }

        return {status:"logged", externalLogId, payload};
    }
}
