import {NotFoundException} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {Types} from "mongoose";
import {ContentAccessService} from "../content-access/content-access.service";
import {encryptNihongoTrackerKey} from "./crypto";
import {NihongoTrackerService} from "./nihongo-tracker.service";

describe("NihongoTrackerService", () => {
    const user = new Types.ObjectId();
    const serieId = new Types.ObjectId();
    const bookId = new Types.ObjectId();
    const progressId = new Types.ObjectId();
    let service:NihongoTrackerService;
    let integrationModel:Record<string, jest.Mock>;
    let linkModel:Record<string, jest.Mock>;
    let logModel:Record<string, jest.Mock>;
    let overrideModel:Record<string, jest.Mock>;
    let serieModel:Record<string, jest.Mock>;
    let bookModel:Record<string, jest.Mock>;
    let progressModel:Record<string, jest.Mock>;
    let configService:ConfigService;
    let fetchMock:jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        integrationModel = {
            findOne:jest.fn(),
            findOneAndUpdate:jest.fn(),
            exists:jest.fn()
        };
        linkModel = {findOne:jest.fn(), findOneAndUpdate:jest.fn(), countDocuments:jest.fn(), deleteOne:jest.fn()};
        logModel = {findOne:jest.fn(), countDocuments:jest.fn(), create:jest.fn(), updateOne:jest.fn(), deleteOne:jest.fn()};
        overrideModel = {findOne:jest.fn(), findOneAndUpdate:jest.fn(), deleteOne:jest.fn()};
        serieModel = {findOne:jest.fn()};
        bookModel = {findById:jest.fn(), find:jest.fn()};
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([])});
        progressModel = {findOne:jest.fn()};

        const contentAccessService = {
            forUser:jest.fn().mockResolvedValue({showMatureContent:true, seriesMatch:{}})
        } as unknown as ContentAccessService;
        configService = {
            get:jest.fn((key:string) => key === "NIHONGO_TRACKER_SECRET" ? "test-secret" : undefined)
        } as unknown as ConfigService;

        service = new NihongoTrackerService(
            integrationModel as never,
            linkModel as never,
            logModel as never,
            overrideModel as never,
            serieModel as never,
            bookModel as never,
            progressModel as never,
            contentAccessService,
            configService
        );
        fetchMock = jest.spyOn(global, "fetch");
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    it("verifica la clave y solo almacena su versión cifrada", async() => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({valid:true}), {status:200}));
        integrationModel.findOneAndUpdate.mockResolvedValue({});
        integrationModel.findOne.mockResolvedValue({keyPrefix:"nt_test_"});
        linkModel.countDocuments.mockResolvedValue(0);

        await service.connect(user, {apiKey:"nt_test_key_123"});

        expect(fetchMock).toHaveBeenCalledWith(
            "https://nihongotracker.app/api/auth/verify",
            expect.objectContaining({headers:expect.objectContaining({"X-API-Key":"nt_test_key_123"})})
        );
        expect(integrationModel.findOneAndUpdate).toHaveBeenCalledWith(
            {user},
            expect.objectContaining({user, keyPrefix:"nt_test_" , encryptedApiKey:expect.not.stringMatching("nt_test_key_123")}),
            expect.any(Object)
        );
    });

    it("reproduce la búsqueda combinada y conserva Unicode sin doble encoding", async() => {
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockImplementation(async(input)=>{
            const url = String(input);
            if (url.includes("/media/search?")) {
                return new Response(JSON.stringify([{contentId:"local-1", type:"manga"}]), {status:200});
            }
            return new Response(JSON.stringify([{contentId:"anilist-1", type:"manga"}]), {status:200});
        });

        const response = await service.search(user, {
            search:"Fate/kaleid liner プリズマ☆イリヤ",
            type:"manga",
            page:1,
            perPage:10
        });

        const urls = fetchMock.mock.calls.map(([input])=>String(input));
        expect(urls).toContain("https://nihongotracker.app/api/media/search?search=Fate%2Fkaleid+liner+%E3%83%97%E3%83%AA%E3%82%BA%E3%83%9E%E2%98%86%E3%82%A4%E3%83%AA%E3%83%A4&type=manga&page=1&perPage=10");
        expect(urls).toContain("https://nihongotracker.app/api/media/anilist/search?search=Fate%2Fkaleid+liner+%E3%83%97%E3%83%AA%E3%82%BA%E3%83%9E%E2%98%86%E3%82%A4%E3%83%AA%E3%83%A4&type=manga&page=1&perPage=10");
        expect(urls.every((url)=>!url.includes("%252F"))).toBe(true);
        expect(response).toEqual([
            {contentId:"local-1", type:"manga"},
            {contentId:"anilist-1", type:"manga"}
        ]);
    });

    it("usa el filtro NOVEL para novelas ligeras en AniList", async() => {
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify([]), {status:200}));

        await service.search(user, {search:"Oshi no Ko", type:"light-novel"});

        const urls = fetchMock.mock.calls.map(([input])=>String(input));
        expect(urls.some((url)=>url.includes("/media/anilist/search?") && url.includes("type=manga") && url.includes("format=NOVEL"))).toBe(true);
    });

    it("devuelve el historial de registros del libro sin bloquear la relectura", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", sortName:"oshi v05", visibleName:"oshi v05"};
        const serie = {_id:serieId, visibleName:"Oshi no Ko", variant:"manga"};
        const completedProgress = {_id:progressId, time:6120};
        const lastLoggedAt = new Date("2026-09-21T12:00:00.000Z");

        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue(serie);
        overrideModel.findOne.mockResolvedValue(null);
        integrationModel.exists.mockResolvedValue(true);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue(completedProgress)});
        logModel.countDocuments.mockResolvedValue(3);
        logModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({createdAt:lastLoggedAt})});

        const response = await service.bookStatus(user, bookId);

        expect(response).toEqual(expect.objectContaining({
            alreadyLogged:true,
            hasPreviousLogs:true,
            logCount:3,
            lastLoggedAt
        }));
    });

    it.each([
        [0, false],
        [1, true]
    ])("representa correctamente %i registro(s) previo(s)", async(logCount, hasPreviousLogs) => {
        const book = {_id:bookId, serie:serieId, variant:"manga", sortName:"oshi v05", visibleName:"oshi v05"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi no Ko"});
        overrideModel.findOne.mockResolvedValue(null);
        integrationModel.exists.mockResolvedValue(true);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.countDocuments.mockResolvedValue(logCount);
        logModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue(null)});

        const response = await service.bookStatus(user, bookId);

        expect(response.logCount).toBe(logCount);
        expect(response.hasPreviousLogs).toBe(hasPreviousLogs);
        expect(response.alreadyLogged).toBe(hasPreviousLogs);
    });

    it("permite registrar tres progresos completados distintos con su tiempo independiente", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, characters:12000, sortName:"oshi v05", visibleName:"oshi v05"};
        const serie = {_id:serieId, visibleName:"Oshi no Ko", variant:"manga"};
        const firstProgressId = new Types.ObjectId();
        const secondProgressId = new Types.ObjectId();
        const thirdProgressId = new Types.ObjectId();

        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue(serie);
        overrideModel.findOne.mockResolvedValue(null);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:firstProgressId, time:125 * 60})})
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:secondProgressId, time:102 * 60})})
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:thirdProgressId, time:87 * 60})});
        logModel.findOne.mockResolvedValue(null);
        logModel.create
            .mockResolvedValueOnce({_id:new Types.ObjectId()})
            .mockResolvedValueOnce({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-1"}), {status:201}))
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-2"}), {status:201}))
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-3"}), {status:201}));

        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440001"})).resolves.toEqual(expect.objectContaining({status:"logged"}));
        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440002"})).resolves.toEqual(expect.objectContaining({status:"logged"}));
        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440005"})).resolves.toEqual(expect.objectContaining({status:"logged"}));

        const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
        expect(firstBody.time).toBe(125);
        expect(secondBody.time).toBe(102);
        const thirdBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
        expect(thirdBody.time).toBe(87);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("permite registrar relecturas manuales sin un media vinculado", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, characters:12000, sortName:"serie v05", visibleName:"serie v05"};
        const serie = {_id:serieId, visibleName:"Serie sin match", variant:"manga"};
        const firstProgressId = new Types.ObjectId();
        const secondProgressId = new Types.ObjectId();

        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue(serie);
        overrideModel.findOne.mockResolvedValue(null);
        linkModel.findOne.mockResolvedValue({mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Serie sin match"});
        progressModel.findOne
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:firstProgressId, time:70 * 60})})
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:secondProgressId, time:85 * 60})});
        logModel.findOne.mockResolvedValue(null);
        logModel.create
            .mockResolvedValueOnce({_id:new Types.ObjectId()})
            .mockResolvedValueOnce({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-manual-1"}), {status:201}))
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-manual-2"}), {status:201}));

        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440006"})).resolves.toEqual(expect.objectContaining({status:"logged"}));
        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440007"})).resolves.toEqual(expect.objectContaining({status:"logged"}));

        const firstPayload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        const secondPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
        expect(firstPayload).toEqual(expect.objectContaining({mediaId:"", description:"Serie sin match", time:70}));
        expect(secondPayload).toEqual(expect.objectContaining({mediaId:"", description:"Serie sin match", time:85}));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reutiliza el registro local para una misma idempotency key", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, sortName:"oshi v05", visibleName:"oshi v05"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi no Ko"});
        overrideModel.findOne.mockResolvedValue(null);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({externalLogId:"external-1"});
        logModel.create.mockResolvedValue({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({id:"external-1"}), {status:201}));

        const requestId = "550e8400-e29b-41d4-a716-446655440003";
        await service.logBook(user, bookId, {requestId});
        await expect(service.logBook(user, bookId, {requestId})).resolves.toEqual({status:"already_logged", externalLogId:"external-1"});
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("linked: registra una lectura, hace retry idempotente y permite una relectura explícita", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, characters:12000, sortName:"serie v05", visibleName:"serie v05"};
        const serie = {_id:serieId, visibleName:"Serie linked", variant:"manga"};
        const firstProgressId = new Types.ObjectId();
        const secondProgressId = new Types.ObjectId();
        const firstLog = {externalLogId:"external-linked-1"};

        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue(serie);
        overrideModel.findOne.mockResolvedValue(null);
        linkModel.findOne.mockResolvedValue({mode:"linked", mediaType:"manga", mediaId:"146181", mediaTitle:"Serie linked"});
        progressModel.findOne
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:firstProgressId, time:70 * 60})})
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:firstProgressId, time:70 * 60})})
            .mockReturnValueOnce({sort:jest.fn().mockResolvedValue({_id:secondProgressId, time:85 * 60})});
        logModel.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(firstLog)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        logModel.create
            .mockResolvedValueOnce({_id:new Types.ObjectId()})
            .mockResolvedValueOnce({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-linked-1"}), {status:201}))
            .mockResolvedValueOnce(new Response(JSON.stringify({id:"external-linked-2"}), {status:201}));

        const requestId = "550e8400-e29b-41d4-a716-446655440008";
        await expect(service.logBook(user, bookId, {requestId})).resolves.toEqual(expect.objectContaining({status:"logged"}));
        await expect(service.logBook(user, bookId, {requestId})).resolves.toEqual({status:"already_logged", externalLogId:"external-linked-1"});
        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440009"})).resolves.toEqual(expect.objectContaining({status:"logged"}));

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(logModel.create).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(expect.objectContaining({mediaId:"146181", description:"Serie linked", time:70}));
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(expect.objectContaining({mediaId:"146181", description:"Serie linked", time:85}));
    });

    it("no llama dos veces al externo si Mongo rechaza una reserva concurrente", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, sortName:"oshi v05", visibleName:"oshi v05"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi no Ko"});
        overrideModel.findOne.mockResolvedValue(null);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        logModel.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({externalLogId:"external-1"});
        logModel.create.mockRejectedValueOnce({code:11000, message:"duplicate key"});

        await expect(service.logBook(user, bookId, {requestId:"550e8400-e29b-41d4-a716-446655440004"})).resolves.toEqual({status:"already_logged", externalLogId:"external-1"});
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rechaza el registro si el libro o la serie no son accesibles", async() => {
        bookModel.findById.mockResolvedValue(null);
        await expect(service.logBook(user, bookId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("convierte el tiempo local en segundos a minutos y evita duplicados locales", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, characters:12000, sortName:"oshi v04", visibleName:"oshi v04"};
        const serie = {_id:serieId, visibleName:"Serie de prueba", variant:"manga"};
        const link = {mediaType:"manga", mediaId:"123"};
        const progress = {
            _id:progressId,
            currentPage:198,
            characters:11000,
            time:125,
            endDate:new Date("2026-09-20T12:00:00.000Z"),
            lastUpdateDate:new Date("2026-09-20T12:00:00.000Z")
        };

        bookModel.findById.mockResolvedValue(book);
        serieModel.findOne.mockResolvedValue(serie);
        linkModel.findOne.mockResolvedValue(link);
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue(progress)});
        logModel.findOne.mockResolvedValue(null);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key"), keyPrefix:"nt_test"});
        logModel.create.mockResolvedValue({});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({id:"external-1"}), {status:201}));

        const response = await service.logBook(user, bookId);

        expect(response.status).toBe("logged");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://nihongotracker.app/api/logs",
            expect.objectContaining({
                method:"POST",
                body:expect.stringContaining('"time":2')
            })
        );
    });

    it("envía el volumen detectado en el nombre", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:100, sortName:"oshi v04", visibleName:"oshi v04"};
        bookModel.findById.mockResolvedValue(book);
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi"});
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.findOne.mockResolvedValue(null);
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({id:"external-1"}), {status:201}));

        await service.logBook(user, bookId);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://nihongotracker.app/api/logs",
            expect.objectContaining({body:expect.stringContaining('"volume":4')})
        );
    });

    it("prioriza el override manual sobre la detección", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:100, sortName:"oshi v04", visibleName:"oshi v04"};
        bookModel.findById.mockResolvedValue(book);
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi"});
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.findOne.mockResolvedValue(null);
        overrideModel.findOne.mockResolvedValue({volumeNumber:7});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({id:"external-1"}), {status:201}));

        await service.logBook(user, bookId);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://nihongotracker.app/api/logs",
            expect.objectContaining({body:expect.stringContaining('"volume":7')})
        );
    });

    it("usa la posición solo como fallback", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:100, sortName:"oshi tercero", visibleName:"oshi tercero"};
        const other = {_id:new Types.ObjectId(), sortName:"oshi primero"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([other, {}, book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Oshi"});
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.findOne.mockResolvedValue(null);
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({id:"external-1"}), {status:201}));

        await service.logBook(user, bookId);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://nihongotracker.app/api/logs",
            expect.objectContaining({body:expect.stringContaining('"volume":3')})
        );
    });

    it("no envía otra vez un progreso ya registrado", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200};
        const serie = {_id:serieId, visibleName:"Serie de prueba", variant:"manga"};
        const progress = {_id:progressId, currentPage:200, time:60};
        bookModel.findById.mockResolvedValue(book);
        serieModel.findOne.mockResolvedValue(serie);
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaId:"123"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue(progress)});
        logModel.findOne.mockResolvedValue({externalLogId:"external-1"});

        await expect(service.logBook(user, bookId)).resolves.toEqual({status:"already_logged", externalLogId:"external-1"});
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("crea una configuración manual sin consultar un media externo", async() => {
        const serie = {_id:serieId, visibleName:"Serie manual", variant:"manga"};
        serieModel.findOne.mockResolvedValue(serie);
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        const saved = {mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Título manual"};
        linkModel.findOneAndUpdate.mockReturnValue({select:jest.fn().mockResolvedValue(saved)});

        await expect(service.link(user, serieId, {
            mode:"manual",
            mediaTitle:"  Título manual  "
        })).resolves.toEqual(saved);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(linkModel.findOneAndUpdate).toHaveBeenCalledWith(
            {user, serie:serieId},
            expect.objectContaining({mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Título manual"}),
            expect.any(Object)
        );
    });

    it("rechaza títulos manuales vacíos y vínculos sin mediaId", async() => {
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Serie", variant:"manga"});
        await expect(service.link(user, serieId, {mode:"manual", mediaTitle:"   "})).rejects.toThrow("título");
        await expect(service.link(user, serieId, {mode:"linked", mediaTitle:"Serie"})).rejects.toThrow("mediaId");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("registra un manga manual con mediaId vacío y el título configurado", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:150, characters:10000, sortName:"serie v01", visibleName:"serie v01"};
        const serie = {_id:serieId, visibleName:"Nombre local", variant:"manga"};
        const progress = {_id:progressId, time:65 * 60, endDate:new Date("2026-09-21T12:00:00.000Z")};

        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue(serie);
        linkModel.findOne.mockResolvedValue({mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Título configurado"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue(progress)});
        logModel.findOne.mockResolvedValue(null);
        logModel.create.mockResolvedValue({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({_id:"external-manual"}), {status:201}));

        await expect(service.logBook(user, bookId)).resolves.toEqual(expect.objectContaining({status:"logged", externalLogId:"external-manual"}));
        expect(logModel.updateOne).toHaveBeenCalledWith(expect.anything(), {$set:{externalLogId:"external-manual"}});

        const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(payload).toEqual(expect.objectContaining({
            type:"manga",
            mediaId:"",
            description:"Título configurado",
            volume:1,
            pages:150,
            chars:10000,
            time:65,
            date:"2026-09-21T12:00:00.000Z"
        }));
    });

    it("registra doujinshi manual como manga", async() => {
        const book = {_id:bookId, serie:serieId, variant:"doujinshi", pages:20, characters:1000, sortName:"doujin v01", visibleName:"doujin v01"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Doujin", variant:"doujinshi"});
        linkModel.findOne.mockResolvedValue({mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Doujin manual"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:60})});
        logModel.findOne.mockResolvedValue(null);
        logModel.create.mockResolvedValue({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({_id:"external-doujin"}), {status:201}));

        await service.logBook(user, bookId);

        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).type).toBe("manga");
    });

    it("registra novela manual como light-novel y omite pages", async() => {
        const book = {_id:bookId, serie:serieId, variant:"novela", pages:0, characters:50000, sortName:"novela v02", visibleName:"novela v02"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Novela", variant:"novela"});
        linkModel.findOne.mockResolvedValue({mode:"manual", mediaType:"light-novel", mediaId:"", mediaTitle:"Novela manual"});
        progressModel.findOne.mockReturnValue({sort:jest.fn().mockResolvedValue({_id:progressId, time:120})});
        logModel.findOne.mockResolvedValue(null);
        logModel.create.mockResolvedValue({_id:new Types.ObjectId()});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({_id:"external-novel"}), {status:201}));

        await service.logBook(user, bookId);

        const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(payload.type).toBe("light-novel");
        expect(payload.mediaId).toBe("");
        expect(payload.description).toBe("Novela manual");
        expect(payload).not.toHaveProperty("pages");
    });

    it("rechaza un vínculo antiguo marcado como linked si perdió su mediaId", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", sortName:"serie v01", visibleName:"serie v01"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Serie", variant:"manga"});
        linkModel.findOne.mockResolvedValue({mediaType:"manga", mediaTitle:"Serie"});

        await expect(service.logBook(user, bookId)).rejects.toThrow("mediaId");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("mantiene el bloqueo de una serie no accesible por la política de contenido", async() => {
        const book = {_id:bookId, serie:serieId, variant:"doujinshi", sortName:"doujin v01", visibleName:"doujin v01"};
        bookModel.findById.mockResolvedValue(book);
        bookModel.find.mockReturnValue({sort:jest.fn().mockResolvedValue([book])});
        // ContentAccessService produces no matching series for a hidden mature
        // series, so the integration must answer as not found as well.
        serieModel.findOne.mockResolvedValue(null);

        await expect(service.logBook(user, bookId)).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("permite desvincular sin borrar libros ni progresos", async() => {
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Serie", variant:"manga"});
        linkModel.deleteOne.mockResolvedValue({deletedCount:1});

        await expect(service.unlink(user, serieId)).resolves.toEqual({unlinked:true});
        expect(linkModel.deleteOne).toHaveBeenCalledWith({user, serie:serieId});
    });

    it("permite cambiar una serie entre linked y manual", async() => {
        serieModel.findOne.mockResolvedValue({_id:serieId, visibleName:"Serie", variant:"manga"});
        integrationModel.findOne.mockResolvedValue({encryptedApiKey:encryptNihongoTrackerKey(configService, "test-key")});
        const select = jest.fn()
            .mockResolvedValueOnce({mode:"linked", mediaType:"manga", mediaId:"123", mediaTitle:"Serie"})
            .mockResolvedValueOnce({mode:"manual", mediaType:"manga", mediaId:"", mediaTitle:"Serie manual"});
        linkModel.findOneAndUpdate.mockReturnValue({select});
        fetchMock.mockResolvedValue(new Response(JSON.stringify({contentId:"123"}), {status:200}));

        await service.link(user, serieId, {mode:"linked", mediaType:"manga", mediaId:"123", mediaTitle:"Serie"});
        await service.link(user, serieId, {mode:"manual", mediaTitle:"Serie manual"});

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(linkModel.findOneAndUpdate).toHaveBeenLastCalledWith(
            {user, serie:serieId},
            expect.objectContaining({mode:"manual", mediaId:"", mediaTitle:"Serie manual"}),
            expect.any(Object)
        );
    });
});
