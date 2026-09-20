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
import {LogNihongoTrackerBookDto} from "./dto/log-book.dto";
import {decryptNihongoTrackerKey, encryptNihongoTrackerKey} from "./crypto";
import {NihongoTrackerIntegration, NihongoTrackerIntegrationDocument} from "./schemas/integration.schema";
import {NihongoTrackerLink, NihongoTrackerLinkDocument} from "./schemas/link.schema";
import {NihongoTrackerLog, NihongoTrackerLogDocument} from "./schemas/log.schema";
import {NihongoTrackerBookOverride, NihongoTrackerBookOverrideDocument} from "./schemas/book-override.schema";
import {resolveVolumeNumber, VolumeResolution} from "./volume-resolver";

type MediaType = "manga" | "light-novel";

function isDuplicateKeyError(error:unknown):boolean {
    if (typeof error === "object" && error !== null) {
        const candidate = error as {code?:unknown; message?:unknown};
        if (candidate.code === 11000) return true;
        if (typeof candidate.message === "string" && candidate.message.includes("duplicate")) return true;
    }
    const text = String(error);
    return text.includes("duplicate") || text.includes("E11000");
}

function mediaItems(value:unknown):unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "object" || value === null) return [];
    const candidate = value as {hits?:unknown[]; results?:unknown[]; items?:unknown[]; data?:unknown};
    if (Array.isArray(candidate.hits)) return candidate.hits;
    if (Array.isArray(candidate.results)) return candidate.results;
    if (Array.isArray(candidate.items)) return candidate.items;
    if (Array.isArray(candidate.data)) return candidate.data;
    return [];
}

function mediaKey(value:unknown):string {
    if (typeof value !== "object" || value === null) return JSON.stringify(value);
    const item = value as {type?:unknown; contentId?:unknown; id?:unknown; _id?:unknown};
    const id = item.contentId ?? item.id ?? item._id;
    return id === undefined ? JSON.stringify(value) : `${String(item.type || "")}:${String(id)}`;
}

/** Matches NihongoTracker's own QuickLog ordering: local Meilisearch result,
 * then AniList result, with duplicate media removed and the requested limit. */
function mergeMediaResults(local:unknown[], external:unknown[], limit:number):unknown[] {
    const merged:unknown[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < Math.max(local.length, external.length); index += 1) {
        for (const item of [local[index], external[index]]) {
            if (item === undefined) continue;
            const key = mediaKey(item);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
        }
    }
    return merged.slice(0, limit);
}

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
        @InjectModel(NihongoTrackerBookOverride.name)
        private readonly overrideModel: Model<NihongoTrackerBookOverrideDocument>,
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
        const apiKey = await this.keyFor(integration);
        const page = dto.page ?? 1;
        const perPage = dto.perPage ?? 10;
        const localParams = new URLSearchParams({search:dto.search, type:dto.type, page:String(page), perPage:String(perPage)});
        const aniListParams = new URLSearchParams({search:dto.search, type:"manga", page:String(page), perPage:String(perPage)});
        if (dto.type === "light-novel") aniListParams.set("format", "NOVEL");

        const [localResponse, aniListResponse] = await Promise.all([
            this.requestExternal<unknown>(apiKey, `/media/search?${localParams.toString()}`)
                .catch(() => []),
            this.requestExternal<unknown>(apiKey, `/media/anilist/search?${aniListParams.toString()}`)
                .catch(() => [])
        ]);

        return mergeMediaResults(mediaItems(localResponse), mediaItems(aniListResponse), perPage);
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

    private async bookAndResolution(user:Types.ObjectId, bookId:Types.ObjectId):Promise<{
        book:BookDocument;
        serie:SerieDocument;
        resolution:VolumeResolution;
        override?:number;
    }> {
        const policy = await this.contentAccessService.forUser(user);
        const book = await this.bookModel.findById(bookId);
        if (!book) throw new NotFoundException();

        const serie = await this.serieModel.findOne({_id:book.serie, ...policy.seriesMatch});
        if (!serie) throw new NotFoundException();

        const books = await this.bookModel.find({serie:book.serie, variant:book.variant}).sort({sortName:1, _id:1});
        const position = books.findIndex((item) => item._id?.equals(bookId)) + 1;
        const override = await this.overrideModel.findOne({user, book:bookId});
        const resolution = resolveVolumeNumber({
            sortName:book.sortName,
            visibleName:book.visibleName,
            position,
            override:override?.volumeNumber
        });

        return {book, serie, resolution, override:override?.volumeNumber};
    }

    async setBookVolume(user:Types.ObjectId, bookId:Types.ObjectId, volumeNumber:number) {
        await this.bookAndResolution(user, bookId);
        return this.overrideModel.findOneAndUpdate(
            {user, book:bookId},
            {user, book:bookId, volumeNumber},
            {upsert:true, new:true, setDefaultsOnInsert:true, projection:{_id:0, user:0, book:0, createdAt:0, updatedAt:0}}
        );
    }

    async clearBookVolume(user:Types.ObjectId, bookId:Types.ObjectId) {
        await this.bookAndResolution(user, bookId);
        await this.overrideModel.deleteOne({user, book:bookId});
        return {cleared:true};
    }

    async bookStatus(user:Types.ObjectId, bookId:Types.ObjectId) {
        const {book, serie, resolution} = await this.bookAndResolution(user, bookId);
        const integration = await this.integrationModel.exists({user});
        const link = await this.linkModel.findOne({user, serie:book.serie});
        const progress = await this.progressModel.findOne({user, book:bookId, status:"completed"}).sort({endDate:-1, lastUpdateDate:-1});
        const [logCount, lastLog] = await Promise.all([
            this.logModel.countDocuments({user, book:bookId}),
            this.logModel.findOne({user, book:bookId}).sort({createdAt:-1})
        ]);
        const hasPreviousLogs = logCount > 0;
        const lastLoggedAt = (lastLog as unknown as {createdAt?:Date | string} | null)?.createdAt;

        return {
            connected:!!integration,
            linked:!!link,
            completed:!!progress,
            // Kept for clients that still consume the old flag. It is now
            // informational and must not be treated as a write lock.
            alreadyLogged:hasPreviousLogs,
            hasPreviousLogs,
            logCount,
            lastLoggedAt,
            volumeNumber:resolution.volumeNumber,
            volumeSource:resolution.source,
            serieName:serie.visibleName,
            pages:book.variant === "manga" || book.mokured ? book.pages : undefined,
            timeSeconds:progress?.time || 0,
            characters:book.characters || progress?.characters || 0
        };
    }

    async logBook(user: Types.ObjectId, bookId: Types.ObjectId, dto:LogNihongoTrackerBookDto = {}) {
        const {book, serie, resolution} = await this.bookAndResolution(user, bookId);

        const link = await this.linkModel.findOne({user, serie:book.serie});
        if (!link) throw new BadRequestException("Vincula primero la serie con NihongoTracker");

        const progress = await this.progressModel.findOne({user, book:bookId, status:"completed"}).sort({endDate:-1, lastUpdateDate:-1});
        if (!progress?._id) throw new BadRequestException("El volumen todavía no está marcado como terminado");

        const previousByRequest = dto.requestId
            ? await this.logModel.findOne({user, requestId:dto.requestId})
            : null;
        if (previousByRequest) {
            return {status:"already_logged", externalLogId:previousByRequest.externalLogId};
        }

        // One completed ReadProgress represents one deliberate reading. The
        // existing unique (user, progress) index therefore blocks concurrent
        // duplicate submissions without blocking a later reread, which gets a
        // new ReadProgress document.
        const previous = await this.logModel.findOne({user, progress:progress._id});
        if (previous) {
            return {status:"already_logged", externalLogId:previous.externalLogId};
        }

        const volume = dto.volumeNumber ?? resolution.volumeNumber;
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

        let reservation:NihongoTrackerLogDocument;
        try {
            reservation = await this.logModel.create({
                user,
                book:bookId,
                progress:progress._id,
                ...(dto.requestId ? {requestId:dto.requestId} : {})
            });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;

            const existing = await this.logModel.findOne({user, progress:progress._id});
            if (existing) return {status:"already_logged", externalLogId:existing.externalLogId};
            throw error;
        }

        let external:Record<string, unknown>;
        try {
            external = await this.requestExternal<Record<string, unknown>>(
                await this.keyFor(integration),
                "/logs",
                {method:"POST", body:JSON.stringify(payload)}
            );
        } catch (error) {
            // Release the reservation when the external request definitely
            // failed, so the user can retry the same reading.
            if (reservation?._id) await this.logModel.deleteOne({_id:reservation._id});
            throw error;
        }

        const externalLogId = typeof external._id === "string"
            ? external._id
            : typeof external.id === "string" ? external.id : undefined;

        if (reservation?._id && externalLogId) {
            await this.logModel.updateOne({_id:reservation._id}, {$set:{externalLogId}});
        }

        return {status:"logged", externalLogId, payload};
    }
}
