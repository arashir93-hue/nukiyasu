import {UnauthorizedException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {UserDocument} from "./schemas/user.schema";
import {UsersService} from "./users.service";
import {UserPersonalDataCleanupService} from "./user-personal-data-cleanup.service";

describe("UsersService mature content preference", () => {
    const userId = new Types.ObjectId();
    let findByIdAndUpdate:jest.Mock;
    let service:UsersService;

    beforeEach(() => {
        findByIdAndUpdate = jest.fn();
        const userModel = {findByIdAndUpdate} as unknown as Model<UserDocument>;
        service = new UsersService(userModel, {cleanup:jest.fn()} as unknown as UserPersonalDataCleanupService);
    });

    it("persiste y devuelve el nuevo valor efectivo", async() => {
        findByIdAndUpdate.mockResolvedValue({showMatureContent:true});

        await expect(
            service.updateMatureContentPreference(userId, true)
        ).resolves.toBe(true);

        expect(findByIdAndUpdate).toHaveBeenCalledWith(
            userId,
            {$set:{showMatureContent:true}},
            {new:true}
        );
    });

    it("rechaza un identificador de usuario que ya no existe", async() => {
        findByIdAndUpdate.mockResolvedValue(null);

        await expect(
            service.updateMatureContentPreference(userId, false)
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});

describe("UsersService personal data cleanup", () => {
    const userId = new Types.ObjectId();

    it("limpia los datos nuevos antes de eliminar el usuario", async() => {
        const order:string[] = [];
        const userModel = {
            findByIdAndDelete:jest.fn(async() => { order.push("user"); return {_id:userId}; })
        } as unknown as Model<UserDocument>;
        const cleanup = {
            cleanup:jest.fn(async() => { order.push("personal-data"); })
        };
        const service = new UsersService(userModel, cleanup as unknown as UserPersonalDataCleanupService);

        await expect(service.deleteUser(userId)).resolves.toEqual({_id:userId});

        expect(order).toEqual(["personal-data", "user"]);
        expect(cleanup.cleanup).toHaveBeenCalledWith(userId);
        expect(userModel.findByIdAndDelete).toHaveBeenCalledWith(userId);
    });

    it("no elimina el usuario si la limpieza falla", async() => {
        const userModel = {
            findByIdAndDelete:jest.fn()
        } as unknown as Model<UserDocument>;
        const cleanup = {
            cleanup:jest.fn().mockRejectedValue(new Error("cleanup failed"))
        };
        const service = new UsersService(userModel, cleanup as unknown as UserPersonalDataCleanupService);

        await expect(service.deleteUser(userId)).rejects.toThrow("cleanup failed");
        expect(userModel.findByIdAndDelete).not.toHaveBeenCalled();
    });
});
