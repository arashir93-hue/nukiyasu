import {UnauthorizedException} from "@nestjs/common";
import {Model, Types} from "mongoose";
import {UserDocument} from "./schemas/user.schema";
import {UsersService} from "./users.service";

describe("UsersService mature content preference", () => {
    const userId = new Types.ObjectId();
    let findByIdAndUpdate:jest.Mock;
    let service:UsersService;

    beforeEach(() => {
        findByIdAndUpdate = jest.fn();
        const userModel = {findByIdAndUpdate} as unknown as Model<UserDocument>;
        service = new UsersService(userModel);
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
