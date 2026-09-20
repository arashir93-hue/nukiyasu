import {
    Controller,
    Get,
    Req,
    Res,
    UseGuards,
    HttpStatus,
    UnauthorizedException,
    Param
} from "@nestjs/common";
import {AppService} from "./app.service";
import {Request, Response} from "express";
import {JwtAuthGuard} from "./auth/strategies/jwt.strategy";
import {ApiOkResponse, ApiTags} from "@nestjs/swagger";
import {Types} from "mongoose";
import {UsersService} from "./users/users.service";
import {InjectQueue} from "@nestjs/bull";
import {Queue} from "bull";
import {Throttle} from "@nestjs/throttler";
import {parseLibraryStaticPath, sendStaticFile} from "./helpers/staticFiles";
import {ContentAccessService} from "./content-access/content-access.service";

@Controller()
@UseGuards(JwtAuthGuard)
@ApiTags("Global")
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly usersService:UsersService,
        @InjectQueue("rescan-library") private readonly rescanQueue: Queue,
        private readonly contentAccessService:ContentAccessService
    ) {}

    @ApiOkResponse({status:HttpStatus.OK})
    @Get()
    getHello(): string {
        return this.appService.getHello();
    }

    @Get("rescan/:variant")
    @ApiOkResponse({status:HttpStatus.OK})
    async rescanLibrary(@Req() req:Request, @Param("variant") variant:"manga" | "novela") {
        if (!req.user) throw new UnauthorizedException();

        const {userId} = req.user as {userId:Types.ObjectId};

        await this.usersService.isAdmin(userId);

        const job = await this.rescanQueue.add(variant === "manga" ? "scanmangas" : "scanranobe");

        console.log(`created job ${ job.id}`);

        return {status:"OK"};
    }

    @ApiOkResponse({status:HttpStatus.OK})
    @Get("static/*")
    // Un lector puede solicitar cientos de páginas al abrir un tomo Mokuro.
    // Mantener un límite evita abusos, pero 200 solicitudes bloquea volúmenes
    // legítimos antes de que lleguen a sus últimas páginas.
    @Throttle(5000, 10)
    async serveFiles(@Req() req: Request, @Res() res: Response) {
        if (!req.user) throw new UnauthorizedException();

        let relativePath: string;

        /**
         * Las rutas van a tender a usar elementos japoneses así que es necesario decodificar la url
         * para poder acceder bien a los archivos del sistema
         */
        try {
            relativePath = decodeURIComponent(req.path.replace("/api/static", ""));
        } catch {
            res.sendStatus(404);
            return;
        }

        const libraryPath = parseLibraryStaticPath(relativePath);

        if (!libraryPath) {
            res.sendStatus(404);
            return;
        }

        const {userId} = req.user as {userId:Types.ObjectId};
        const policy = await this.contentAccessService.forUser(userId);

        await this.contentAccessService.assertStaticFileAccessible(
            libraryPath.variant,
            libraryPath.seriePath,
            policy
        );

        sendStaticFile(res, "./../exterior", libraryPath.relativePath);
    }
}
