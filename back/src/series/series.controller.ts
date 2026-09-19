import {Controller, Get, Req, HttpStatus, Query, UseGuards, UnauthorizedException, Param, NotFoundException, Patch, Body, BadRequestException, Res, Post} from "@nestjs/common";
import {SeriesService} from "./series.service";
import {ApiOkResponse, ApiTags} from "@nestjs/swagger";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {SeriesSearch, UpdateSerie} from "./interfaces/query";
import {BooksService} from "../books/books.service";
import {Request, Response} from "express";
import {Types} from "mongoose";
import {SerieWithProgress} from "./interfaces/serieWithProgress";
import {ParseObjectIdPipe} from "../validation/objectId";
import {UpdateSeriesDto} from "./dto/update-series.dto";
import {WebsocketsGateway} from "../websockets/websockets.gateway";
import {UsersService} from "../users/users.service";
import {ReadlistService} from "../readlist/readlist.service";
import {SerieprogressService} from "../serieprogress/serieprogress.service";
import {mangaZipFilter, novelZipFilter, resolveInside, streamZipToResponse} from "../books/helpers/zipDownload";
import * as path from "path";
import * as fs from "fs-extra";
import {ContentAccessService} from "../content-access/content-access.service";

@Controller("series")
@UseGuards(JwtAuthGuard)
@ApiTags("Series")
export class SeriesController {
    constructor(
        private readonly seriesService: SeriesService,
        private readonly booksService:BooksService,
        private readonly websocketsGateway:WebsocketsGateway,
        private readonly usersService:UsersService,
        private readonly readListsService:ReadlistService,
        private readonly serieProgressService:SerieprogressService,
        private readonly contentAccessService:ContentAccessService
    ) {}

    @Get("genresAndArtists")
    @ApiOkResponse({status:HttpStatus.OK})
    async getGenresAndArtists(@Req() req:Request) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.seriesService.getArtistsAndGenres(policy);
    }

    @Post(":serieId/zip")
    async zipSerie(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serie:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};

        await this.usersService.isAdmin(userId);

        const foundSerie = await this.seriesService.findById(serie);

        if (!foundSerie) throw new NotFoundException();

        await this.booksService.zipBooksFromSerie(foundSerie._id);

        console.log("Finished series "+foundSerie.visibleName);

        return {status:"OK"};
    }

    @Get(":variant")
    @ApiOkResponse({status:HttpStatus.OK})
    async filterSeries(@Req() req:Request, @Query() query:SeriesSearch, @Param("variant") variant:"manga" | "novela" | "all") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        if (!query.page || query.page < 1) {
            query.page = 1;
        }

        if (!query.limit || query.limit < 1) {
            query.limit = 25;
        }

        const foundSeries = await this.seriesService.filterSeries(userId, variant, query, policy);

        let skip = 0;
        let pages = foundSeries.pages;

        if (query.readprogress || query.readlist) {
            skip = (query.page - 1) * query.limit;
        }

        const seriesWithProgress = (await Promise.all(foundSeries.data.map(async(serie)=>{
            const serieBooks = await this.booksService.getSerieBooks(serie._id);

            if (serieBooks.length === 0) return null;

            const serieData = this.serieProgressService.getSerieProgress(serie, serieBooks);
            const readlist = serie.seriereadlist;

            if (!serieData) return null;

            const serieWithProgress:SerieWithProgress = {
                ...serie,
                readlist,
                ...serieData
            };

            if ((query.readlist && readlist) || 
                (query.readprogress === "completed" && serieData.unreadBooks === 0) ||
                (query.readprogress === "reading" && ((serieData.unreadBooks !== serieWithProgress.bookCount) && (serieData.unreadBooks && serieData.unreadBooks > 0))) ||
                (query.readprogress === "unread" && serieData.unreadBooks === serieWithProgress.bookCount) ||
                (!query.readlist && !query.readprogress)) {
                return serieWithProgress;
            }

            return null;
        }))).filter((serie):serie is SerieWithProgress => serie !== null);

        let paginatedSeries:SerieWithProgress[] = seriesWithProgress;

        if (query.readprogress || query.readlist) {
            pages = Math.ceil(seriesWithProgress.length / query.limit);
            paginatedSeries = seriesWithProgress.slice(skip, skip + query.limit);
        }

        const response = {data:paginatedSeries, pages};

        return response;
    }

    @Get(":variant/random")
    async getRandomSerie(@Req() req:Request, @Query() query:SeriesSearch, @Param("variant") variant:"manga" | "novela") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const foundSeries = await this.seriesService.filterSeries(userId, variant, query, policy);

        const promises = foundSeries.data.map(async(serieElem)=>{
            const serieBooks = await this.booksService.getSerieBooks(serieElem._id);
            if (serieBooks.length === 0) return null;
            const serieData = this.serieProgressService.getSerieProgress(serieElem, serieBooks);
            const readlist = await this.readListsService.isInReadlist(userId, serieElem._id);

            if (serieData) {
                const serieWithProgress:SerieWithProgress = {
                    ...serieElem,
                    readlist,
                    ...serieData
                };
                
                return serieWithProgress;
            }

            return null;
        });

        let seriesWithProgress = await Promise.all(promises);

        if (seriesWithProgress.length > 0) {
            seriesWithProgress = seriesWithProgress.filter(x=>x !== null);

            if (query.readlist !== undefined) {
                seriesWithProgress = seriesWithProgress.filter(x=>x?.readlist === true);
            }
            switch (query.readprogress) {
            case "completed": {
                seriesWithProgress = seriesWithProgress.filter(x=>x?.unreadBooks === 0);
                break;
            }
            case "reading":{
                seriesWithProgress = seriesWithProgress.filter(x=>x?.unreadBooks !== x?.bookCount && x?.unreadBooks && x.unreadBooks > 0);
                break;
            }
            case "unread":{
                seriesWithProgress = seriesWithProgress.filter(x=>x?.unreadBooks === x?.bookCount);
                break;
            }
            default:{
                break;
            }
            }
        }

        const response = seriesWithProgress[Math.floor(Math.random() * seriesWithProgress.length)];

        if (!response) throw new BadRequestException();

        return response;
    }

    @Patch(":id")
    @ApiOkResponse({status:HttpStatus.OK})
    async updateSerie(@Req() req:Request, @Param("id", ParseObjectIdPipe) serie:Types.ObjectId, @Body() updateSerieDto:UpdateSeriesDto) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};

        await this.usersService.isAdmin(userId);

        this.websocketsGateway.sendNotificationToClient({action:"LIBRARY_UPDATE"});

        const updateSerie:UpdateSerie = {
            ...updateSerieDto,
            lastModifiedDate:new Date()
        };

        return this.seriesService.editSerie(serie, updateSerie);
    }

    @Get(":variant/alphabet")
    @ApiOkResponse({status:HttpStatus.OK})
    async getAlphabetGroups(@Req() req:Request, @Query() query:SeriesSearch, @Param("variant") variant:"manga" | "novela") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const filledLetters = await this.seriesService.getAlphabetCount(variant, policy, query);
        const alphabet: {
            group: string;
            count: number;
        }[] = [{group:"all", count:0}, {group:"#", count:0}];

        // Create an object for each letter of the alphabet with count 0
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(97 + i); // ASCII code for lowercase 'a' is 97
            alphabet.push({group: letter, count: 0});
        }

        // Populate the counts from the aggregation result
        for (const result of filledLetters) {
            const index = alphabet.findIndex(item => item.group === result.group.toLowerCase());
            if (index !== -1) {
                alphabet[0].count += result.count;
                alphabet[index].count = result.count;
            }
        }

        return alphabet;
    }

    @Get(":variant/readlist")
    async getReadlistSeries(@Req() req:Request, @Param("variant") variant:"manga" | "novela") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const foundSeries = await this.readListsService.getUserReadListSeries(userId, variant, policy);

        const promises = foundSeries.map(async(serieElem) => {
            const serieData = await this.booksService.getSerieStats(userId, serieElem._id, variant);
            const readlist = await this.readListsService.isInReadlist(userId, serieElem._id);
        
            if (serieData) {
                const serieWithProgress: SerieWithProgress = {
                    ...serieElem,
                    readlist,
                    ...serieData
                };
        
                return serieWithProgress;
            }
        
            // Si serieData no existe, devolvemos null para mantener el orden correcto en el array final.
            return null;
        });
        
        // Esperamos a que todas las promesas se resuelvan.
        const seriesWithProgress = await Promise.all(promises);
        
        // Filtramos los valores nulos que se devolvieron en el caso de serieData no exista.
        const response =  seriesWithProgress.filter((item) => item !== null);
        
        return response;
    }

    @Get(":variant/paused")
    async getPausedSeries(@Req() req:Request, @Param("variant") variant:"manga" | "novela") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const foundSeries = await this.serieProgressService.getUserPausedSeries(userId, variant, policy);

        const promises = foundSeries.map(async(serieElem) => {
            const serieData = await this.booksService.getSerieStats(userId, serieElem._id, variant);
            const readlist = await this.readListsService.isInReadlist(userId, serieElem._id);
        
            if (serieData) {
                const serieWithProgress: SerieWithProgress = {
                    ...serieElem,
                    readlist,
                    ...serieData,
                    paused:true
                };
        
                return serieWithProgress;
            }
        
            // Si serieData no existe, devolvemos null para mantener el orden correcto en el array final.
            return null;
        });
        
        // Esperamos a que todas las promesas se resuelvan.
        const seriesWithProgress = await Promise.all(promises);
        
        // Filtramos los valores nulos que se devolvieron en el caso de serieData no exista.
        const response =  seriesWithProgress.filter((item) => item !== null);
        
        return response;
    }

    @Patch(":id/defaultname")
    async changeAllBooksName(@Req() req:Request, @Param("id", ParseObjectIdPipe) id:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};

        await this.usersService.isAdmin(userId);

        const serieBooks = await this.booksService.getSerieBooks(id);

        serieBooks.forEach(async(serie)=>{
            await this.booksService.getDefaultName(serie._id, true);
        });

        return {status:"OK"};
    }

    @Get("serie/:id")
    @ApiOkResponse({status:HttpStatus.OK})
    async getSerie(@Req() req:Request, @Param("id", ParseObjectIdPipe) id:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        const foundSerie = await this.seriesService.findAccessibleById(id, policy);

        if (!foundSerie) throw new NotFoundException();

        const serieData = await this.booksService.getSerieStats(userId, foundSerie._id, foundSerie.variant);
        const readlist = await this.readListsService.isInReadlist(userId, foundSerie._id);

        if (serieData) {
            const serieWithProgress:SerieWithProgress = {
                ...foundSerie,
                readlist,
                ...serieData
            };

            return serieWithProgress;
        }
    }

    @Get(":serieId/download")
    async downloadZip(@Req() req:Request, @Res() res:Response, @Param("serieId", ParseObjectIdPipe) serie:Types.ObjectId) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);
        const foundSerie = await this.seriesService.findAccessibleById(serie, policy);
        const exteriorRoot = path.join(__dirname, "..", "..", "..", "exterior");
        const isNovela = foundSerie.variant === "novela";

        const serieFolderPath = resolveInside(
            exteriorRoot,
            isNovela ? "novelas" : "mangas",
            foundSerie.path
        );

        if (!fs.existsSync(serieFolderPath)) throw new NotFoundException();

        await streamZipToResponse(
            res,
            [{
                kind: "directory",
                path: serieFolderPath,
                filter: isNovela ? novelZipFilter : mangaZipFilter
            }],
            `${foundSerie.sortName}.zip`
        );
    }
}
