import {createCipheriv, createDecipheriv, createHash, randomBytes} from "crypto";
import {ConfigService} from "@nestjs/config";
import {InternalServerErrorException} from "@nestjs/common";

function encryptionKey(configService: ConfigService): Buffer {
    const secret = configService.get<string>("NIHONGO_TRACKER_SECRET")
        || configService.get<string>("ACCESS_SECRET");

    if (!secret) {
        throw new InternalServerErrorException("No hay un secreto configurado para proteger la integración");
    }

    return createHash("sha256").update(secret).digest();
}

export function encryptNihongoTrackerKey(configService: ConfigService, value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(configService), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptNihongoTrackerKey(configService: ConfigService, value: string): string {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) {
        throw new InternalServerErrorException("La clave de NihongoTracker almacenada no es válida");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey(configService),
        Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final()
    ]).toString("utf8");
}
