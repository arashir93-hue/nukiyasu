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
    let serieModel:Record<string, jest.Mock>;
    let bookModel:Record<string, jest.Mock>;
    let progressModel:Record<string, jest.Mock>;
    let configService:ConfigService;
    let fetchMock:jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        integrationModel = {
            findOne:jest.fn(),
            findOneAndUpdate:jest.fn()
        };
        linkModel = {findOne:jest.fn(), findOneAndUpdate:jest.fn(), countDocuments:jest.fn()};
        logModel = {findOne:jest.fn(), create:jest.fn()};
        serieModel = {findOne:jest.fn()};
        bookModel = {findById:jest.fn(), find:jest.fn()};
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

    it("rechaza el registro si el libro o la serie no son accesibles", async() => {
        bookModel.findById.mockResolvedValue(null);
        await expect(service.logBook(user, bookId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("convierte el tiempo local en segundos a minutos y evita duplicados locales", async() => {
        const book = {_id:bookId, serie:serieId, variant:"manga", pages:200, characters:12000};
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
});
