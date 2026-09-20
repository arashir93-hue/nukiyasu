import {Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UnauthorizedException, UseGuards} from "@nestjs/common";
import {Request} from "express";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ParseObjectIdPipe} from "../validation/objectId";
import {ConnectNihongoTrackerDto} from "./dto/connect.dto";
import {LinkNihongoTrackerDto} from "./dto/link.dto";
import {LogNihongoTrackerBookDto} from "./dto/log-book.dto";
import {SearchNihongoTrackerDto} from "./dto/search.dto";
import {VolumeOverrideDto} from "./dto/volume-override.dto";
import {NihongoTrackerService} from "./nihongo-tracker.service";

@Controller("nihongo-tracker")
@UseGuards(JwtAuthGuard)
export class NihongoTrackerController {
    constructor(private readonly nihongoTrackerService: NihongoTrackerService) {}

    private userId(req: Request): Types.ObjectId {
        if (!req.user) throw new UnauthorizedException();
        return (req.user as {userId:Types.ObjectId}).userId;
    }

    @Get("status")
    status(@Req() req:Request) {
        return this.nihongoTrackerService.status(this.userId(req));
    }

    @Patch("connection")
    connect(@Req() req:Request, @Body() dto:ConnectNihongoTrackerDto) {
        return this.nihongoTrackerService.connect(this.userId(req), dto);
    }

    @Delete("connection")
    disconnect(@Req() req:Request) {
        return this.nihongoTrackerService.disconnect(this.userId(req));
    }

    @Get("media/search")
    search(@Req() req:Request, @Query() dto:SearchNihongoTrackerDto) {
        return this.nihongoTrackerService.search(this.userId(req), dto);
    }

    @Get("series/:serieId")
    getLink(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId) {
        return this.nihongoTrackerService.getLink(this.userId(req), serieId);
    }

    @Put("series/:serieId")
    link(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId, @Body() dto:LinkNihongoTrackerDto) {
        return this.nihongoTrackerService.link(this.userId(req), serieId, dto);
    }

    @Delete("series/:serieId")
    unlink(@Req() req:Request, @Param("serieId", ParseObjectIdPipe) serieId:Types.ObjectId) {
        return this.nihongoTrackerService.unlink(this.userId(req), serieId);
    }

    @Post("books/:bookId/log")
    logBook(@Req() req:Request, @Param("bookId", ParseObjectIdPipe) bookId:Types.ObjectId, @Body() dto:LogNihongoTrackerBookDto) {
        return this.nihongoTrackerService.logBook(this.userId(req), bookId, dto);
    }

    @Get("books/:bookId/status")
    bookStatus(@Req() req:Request, @Param("bookId", ParseObjectIdPipe) bookId:Types.ObjectId) {
        return this.nihongoTrackerService.bookStatus(this.userId(req), bookId);
    }

    @Put("books/:bookId/volume")
    setBookVolume(@Req() req:Request, @Param("bookId", ParseObjectIdPipe) bookId:Types.ObjectId, @Body() dto:VolumeOverrideDto) {
        return this.nihongoTrackerService.setBookVolume(this.userId(req), bookId, dto.volumeNumber);
    }

    @Delete("books/:bookId/volume")
    clearBookVolume(@Req() req:Request, @Param("bookId", ParseObjectIdPipe) bookId:Types.ObjectId) {
        return this.nihongoTrackerService.clearBookVolume(this.userId(req), bookId);
    }
}
