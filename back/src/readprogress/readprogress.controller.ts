import {
    Controller,
    Req,
    Post,
    Get,
    Body,
    UseGuards,
    Query,
    UnauthorizedException,
    BadRequestException,
    HttpStatus,
    Param,
    Delete,
    Patch,
    NotFoundException
} from "@nestjs/common";
import {ReadprogressService} from "./readprogress.service";
import {ProgressDto} from "./dto/create-readprogress.dto";
import {Request} from "express";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {Types} from "mongoose";
import {
    CreateReadProgress
} from "./interfaces/readprogress.interface";
import {ReadlistService} from "../readlist/readlist.service";
import {ReadProgress, ReadProgressStatus} from "./schemas/readprogress.schema";
import {BooksService} from "../books/books.service";
import {ParseObjectIdPipe} from "../validation/objectId";
import {ApiOkResponse, ApiTags} from "@nestjs/swagger";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {FullSerieProgress} from "../serieprogress/interfaces/serieprogress";
import {Book} from "../books/schemas/book.schema";
import {UpdateReadProgressDto} from "./dto/update-readprogress.dto";
import {isNumberString} from "class-validator";
import {ContentAccessPolicy, ContentAccessService} from "../content-access/content-access.service";

@Controller("readprogress")
@ApiTags("Progresos de Lectura")
@UseGuards(JwtAuthGuard)
export class ReadprogressController {
    constructor(
        private readonly readprogressService: ReadprogressService,
        private readonly readListService: ReadlistService,
        private readonly booksService:BooksService,
        private readonly serieProgressService:SerieprogressService,
        private readonly contentAccessService:ContentAccessService
    ) {}

    @Post()
    @ApiOkResponse({status:HttpStatus.OK})
    async modifyOrCreateProgress(
        @Req() req:Request,
        @Body() progressDto:ProgressDto,
        ignoreSerie?:boolean,
        accessPolicy?:ContentAccessPolicy
    ):Promise<ReadProgress | null> {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = accessPolicy ?? await this.contentAccessService.forUser(userId);
        const foundBook = await this.booksService.findAccessibleById(progressDto.book, policy);

        if (!foundBook) throw new BadRequestException();

        const foundProgress = await this.readprogressService.findProgressByBookAndUser(progressDto.book, userId);

        // A repeated terminal/unread event for the same current progress is
        // idempotent.  Starting a new reading session is deliberately
        // represented by `status: "reading"` after the latest progress was
        // completed; that path must fall through and create a new document.
        if (progressDto.status !== "reading" && foundProgress?.status === progressDto.status) return foundProgress;

        if (progressDto.status !== "unread") {
            // Si el progreso es avanzar la lectura, quitarlo de la lista de lectura si existe
            if (!ignoreSerie) {
                await this.serieProgressService.createOrIncreaseBooks({
                    serie:foundBook.serie,
                    book:progressDto.book,
                    user:userId,
                    action:"add"}, foundBook.variant);
            }

            const foundReadList = await this.readListService.findSerieInReadList(userId, foundBook?.serie);
      
            if (foundReadList) {
                await this.readListService.removeSerieWithId(foundReadList._id);
            }
        } else {
            if (!ignoreSerie) {
                await this.serieProgressService.createOrIncreaseBooks({
                    serie:foundBook.serie,
                    book:progressDto.book,
                    user:userId,
                    action:"remove"}, foundBook.variant);
            }
        }

        if (!foundProgress || foundProgress.status === "completed") {
            // No hay progreso, o se está comenzando una nueva sesión después
            // de una lectura completada.  A completed -> completed request was
            // returned above, so duplicate completion events cannot create a
            // second historical progress.

            const newProgress:CreateReadProgress = {
                user:userId,
                ...progressDto,
                serie:foundBook.serie,
                startDate:new Date(),
                lastUpdateDate:new Date(),
                variant:foundBook.variant
            };

            return this.readprogressService.createReadProgress(newProgress);
        }

        // Se ha encontrado un proceso con estado de reading o unread, se actualizan los datos
        const updatedProgress:Partial<ReadProgress> = {
            ...progressDto,
            characters:progressDto.characters ? progressDto.characters : foundProgress.characters,
            currentPage:progressDto.currentPage ? progressDto.currentPage : foundProgress.currentPage
        };
        return this.readprogressService.modifyReadProgress(foundProgress._id as Types.ObjectId, {...updatedProgress, lastUpdateDate:new Date()});
    }

    @Post(":serieId")
    async setSerieAsRead(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serieId, policy);

        const found = await this.booksService.getSerieBooks(serieId);

        const promises = found.map(async(book)=>{
            await this.modifyOrCreateProgress(
                req,
                {book:book._id, status:"completed", currentPage:book.pages, characters:book.characters, endDate:new Date()},
                true,
                policy
            );
        });

        await Promise.all(promises);

        const [firstBook] = found;

        if (!firstBook) throw new BadRequestException();

        await this.serieProgressService.createOrModifySerieProgress(userId, serieId, found.map(x=>x._id), firstBook.variant);

        return {status:"OK"};
    }

    @Get()
    @ApiOkResponse({status:HttpStatus.OK})
    async getReadProgress(@Req() req:Request, @Query("book", ParseObjectIdPipe) book:Types.ObjectId, @Query("status") status?:ReadProgressStatus) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);
        const foundBook = await this.booksService.findAccessibleById(book, policy);

        if (!foundBook) throw new NotFoundException();

        const found = await this.readprogressService.findProgressByBookAndUser(book, userId, status);

        if (found) return found;

        return {};
    }

    @Get("all")
    @ApiOkResponse({status:HttpStatus.OK})
    async getAllReadProgress(@Req() req:Request, @Query("page") page:number, @Query("limit") limit:number, @Query("sort") sort:string) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        if (!page) {
            page = 1;
        }

        if (!limit) {
            limit = 50;
        }

        if (!sort) {
            sort = "!lastUpdateDate";
        }

        return this.readprogressService.findUserProgresses(userId, page, limit, sort, policy);
    }

    @Get("tablero")
    @ApiOkResponse({status:HttpStatus.OK})
    async getSeriesProgress(@Req() req:Request) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const series:FullSerieProgress[] = await this.serieProgressService.getUserSeriesProgress(userId, policy);
        const readingSeries = (await this.readprogressService.getReadingSeries(userId, policy)).map(x=>x.serie.toString());

        const returnBooks:{book:Book, date:Date}[] = [];

        series.forEach((serie)=>{
            if (serie.readBooks.length === 0 || serie.readBooks.length === serie.serieBooks.length || serie.paused || 
                readingSeries.indexOf(serie.serie.toString()) !== -1) return;

            const unreadBooks = serie.serieBooks.filter(
                x=>serie.readBooks.findIndex(
                    y=>y._id.equals(x._id as Types.ObjectId)
                ) === -1
            ).sort((a, b)=>{
                if (a.sortName < b.sortName) {
                    return -1;
                } else {
                    return 1;
                }
            });

            returnBooks.push({book:unreadBooks[0], date:serie.lastUpdate});
        });

        returnBooks.sort((a, b)=>{
            if (!a.date || !b.date) return 0;
            return b.date.getTime() - a.date.getTime();
        });

        const result = returnBooks.map((v)=>v.book).filter(x=>x !== undefined);

        return result;
    }

    @Get("reading")
    async getReading(@Req() req:Request) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readprogressService.getReadingBooks(userId, policy);
    }

    @Get("mystats")
    async getMyStats(@Req() req:Request) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readprogressService.getUserStats(userId, policy);
    }

    @Get("mygraphs")
    async getMyGraphs(@Req() req:Request) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readprogressService.getGraphStats(userId, policy);
    }

    @Get("serie/:serieId/speed")
    async getSerieSpeed(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serie:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serie, policy);

        return this.readprogressService.getSerieSpeed(userId, serie);
    }

    @Get("book/:bookId")
    async getBookProgress(@Req() req:Request, @Param("bookId", ParseObjectIdPipe) book:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);
        const foundBook = await this.booksService.findAccessibleById(book, policy);

        if (!foundBook) throw new NotFoundException();

        return this.readprogressService.getBookProgresses(userId, book);
    }

    @Get("streak/:year/:month")
    async getMonthStreak(@Req() req:Request, @Param("month") month:string, @Param("year") year:string) {
        if (!isNumberString(month) || !isNumberString(year)) throw new BadRequestException();

        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readprogressService.getMonthStreak(userId, parseInt(year), parseInt(month), policy);
    }

    @Get("logs/:year/:month/:day")
    async getDayLogs(@Req() req:Request, @Param("day") day:string, @Param("month") month:string, @Param("year") year:string) {
        if (!isNumberString(month) || !isNumberString(year) || !isNumberString(day)) throw new BadRequestException();

        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readprogressService.getDayLogs(userId, parseInt(year), parseInt(month), parseInt(day), policy);
    }

    @Patch(":progressId")
    async editProgress(@Req() req:Request, @Param("progressId", ParseObjectIdPipe) progress:Types.ObjectId, @Body() progressDto:UpdateReadProgressDto) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);
        const foundProgress = await this.readprogressService.findByIdForUser(progress, userId);

        if (!foundProgress) throw new NotFoundException();

        await this.contentAccessService.assertSeriesAccessible(foundProgress.serie, policy);

        return this.readprogressService.modifyReadProgress(progress, progressDto, userId);
    }

    @Patch("serie/:serieId/pause")
    async pauseSerie(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serie:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serie, policy);

        await this.readprogressService.modifyWholeSerie(serie, userId, true);
        return {status:"OK"};
    }

    @Patch("serie/:serieId/resume")
    async resumeSerie(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serie:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(serie, policy);

        await this.readprogressService.modifyWholeSerie(serie, userId, false);
        return {status:"OK"};
    }

    @Delete(":id")
    async deleteReadProgress(@Req() req:Request, @Param("id", ParseObjectIdPipe) id:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);
        const foundProgress = await this.readprogressService.findByIdForUser(id, userId);

        if (!foundProgress) throw new NotFoundException();

        await this.contentAccessService.assertSeriesAccessible(foundProgress.serie, policy);

        return this.readprogressService.deleteReadProgress(id, userId);
    }
}
