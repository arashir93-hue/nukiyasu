import {Module} from "@nestjs/common";
import {BooksService} from "./books.service";
import {BooksController} from "./books.controller";
import {MongooseModule} from "@nestjs/mongoose";
import {Book, BookSchema} from "./schemas/book.schema";
import {ContentAccessModule} from "../content-access/content-access.module";

@Module({
    imports: [
        MongooseModule.forFeature([{name: Book.name, schema: BookSchema}]),
        ContentAccessModule
    ],
    controllers: [BooksController],
    providers: [BooksService],
    exports: [BooksService]
})
export class BooksModule {}
