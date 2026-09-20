import {
    Controller,
    Post,
    Body,
    UnauthorizedException,
    Req,
    UseGuards,
    Get,
    HttpStatus,
    Param
} from "@nestjs/common";
import {ReadlistService} from "./readlist.service";
import {Request} from "express";
import {Types} from "mongoose";
import {JwtAuthGuard} from "../auth/strategies/jwt.strategy";
import {ApiOkResponse, ApiTags} from "@nestjs/swagger";
import {CreateReadlistDto} from "./dto/create-readlist.dto";
import {ContentAccessService} from "../content-access/content-access.service";

@Controller("readlists")
@ApiTags("Listas de Lectura")
@UseGuards(JwtAuthGuard)
export class ReadlistController {
    constructor(
        private readonly readlistService:ReadlistService,
        private readonly contentAccessService:ContentAccessService
    ) {}

    @Post()
    @ApiOkResponse({status:HttpStatus.CREATED})
    async create(@Req() req: Request, @Body() createReadListDto: CreateReadlistDto) {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(createReadListDto.serie, policy);

        return this.readlistService.create({user: userId, serie: createReadListDto.serie});
    }

    @Get(":variant")
    @ApiOkResponse({status:HttpStatus.OK})
    async getReadList(@Req() req: Request, @Param("variant") variant: "manga" | "novela" | "doujinshi") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        return this.readlistService.getUserReadListSeries(userId, variant, policy);
    }

    @Post("delete")
    @ApiOkResponse({status:HttpStatus.OK})
    async removeBookFromList(
    @Req() req: Request,
        @Body() body: {serie: Types.ObjectId}
    ):Promise<void> {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId: Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertSeriesAccessible(body.serie, policy);

        await this.readlistService.removeSerieFromUserList(userId, body.serie);
        return
    }
}
