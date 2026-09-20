import React from "react";
import {useQuery} from "@tanstack/react-query";
import {api} from "../../../api/api";
import {ComponentScroller} from "../../../components/ComponentScroller/ComponentScroller";
import {SectionError, ScrollerSkeleton} from "../../../components/Skeletons/Skeletons";
import {SeriesFilter} from "../../../types/serie";
import {keys} from "../../../lib/queryKeys";
import type {LibraryVariant} from "../../../types/library";
import {libraryRouteForVariant} from "../../../types/library";

interface NewSeriesScrollerProps {
    variant:LibraryVariant;
}

function NewSeriesScroller({variant}:NewSeriesScrollerProps):React.ReactElement {
    const {data:newSeries = [], refetch:newSeriesRefetch, isLoading, isError} = useQuery({
        queryKey:keys.newSeries(variant),
        queryFn:async()=> {
            const res = await api.get<SeriesFilter>(`series/${variant}?sort=!_id&limit=15`);

            if (!res) return [];

            return res.data;
        }
    });

    const title = `Series de ${variant === "manga" ? "manga" : variant === "doujinshi" ? "doujinshi" : "novelas"} nuevas`;

    if (isLoading) return <ScrollerSkeleton title={title}/>;

    if (isError) {
        return <SectionError message="No se pudieron cargar las series nuevas" onRetry={()=>{
            void newSeriesRefetch();
        }}/>;
    }

    if (newSeries.length === 0) return <></>;

    return (
        <ComponentScroller type="series" title={title} components={newSeries} noVariantIndicator
            moreLink={`/app/library/${libraryRouteForVariant(variant)}?sortBy=!_id`}
        />
    );
}

export default NewSeriesScroller;
