import {PipelineStage} from "mongoose";

/**
 * Completa una Serie procedente de agregaciones de favoritos/colecciones con
 * la misma ruta de portada que calcula el endpoint normal de series.
 */
export function serieCoverStages():PipelineStage[] {
    return [
        {$lookup: {
            from:"books",
            let:{serieId:"$_id"},
            as:"coverBook",
            pipeline:[
                {$match:{$expr:{$eq:["$serie", "$$serieId"]}}},
                {$match:{missing:{$ne:true}}},
                {$sort:{sortName:1, _id:1}},
                {$limit:1},
                {$project:{seriePath:1, imagesFolder:1, thumbnailPath:1}}
            ]
        }},
        {$unwind:{path:"$coverBook", preserveNullAndEmptyArrays:true}},
        {$set:{thumbnailPath:{$cond:[
            {$and:[
                {$ne:["$coverBook.seriePath", null]},
                {$ne:["$coverBook.imagesFolder", null]},
                {$ne:["$coverBook.thumbnailPath", null]}
            ]},
            {$concat:["$coverBook.seriePath", "/", "$coverBook.imagesFolder", "/", "$coverBook.thumbnailPath"]},
            "$thumbnailPath"
        ]}}},
        {$project:{coverBook:0}}
    ];
}
