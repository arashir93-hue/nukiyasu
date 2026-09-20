import React from "react";
import {useQuery} from "@tanstack/react-query";
import {api} from "../../../api/api";
import {ComponentScroller} from "../../../components/ComponentScroller/ComponentScroller";
import {SectionError, ScrollerSkeleton} from "../../../components/Skeletons/Skeletons";
import {SeriesFilter} from "../../../types/serie";
import {keys} from "../../../lib/queryKeys";
import type {LibraryVariant} from "../../../types/library";
import {libraryRouteForVariant} from "../../../types/library";

interface RecentSeriesScrollerProps {
    variant:LibraryVariant;
}

function RecentSeriesScroller({variant}:RecentSeriesScrollerProps):React.ReactElement {
    const {data:recentSeries = [], refetch:recentSeriesRefetch, isLoading, isError} = useQuery({
        queryKey:keys.recentSeries(variant),
        queryFn:async()=> {
            const res = await api.get<SeriesFilter>(`series/${variant}?sort=!lastModifiedDate&limit=15`);

            if (!res) return [];

            return res.data;
        }
    });

    const title = `Series de ${variant === "manga" ? "manga" : variant === "doujinshi" ? "doujinshi" : "novelas"} con volúmenes nuevos`;

    if (isLoading) return <ScrollerSkeleton title={title}/>;

    if (isError) {
        return <SectionError message="No se pudieron cargar las series con volúmenes nuevos" onRetry={()=>{
            void recentSeriesRefetch();
        }}/>;
    }

    if (recentSeries.length === 0) return <></>;

    return (
        <ComponentScroller type="series" title={title} components={recentSeries} noVariantIndicator
            moreLink={`/app/library/${libraryRouteForVariant(variant)}?sortBy=!lastModifiedDate`}
        />
    );
}

export default RecentSeriesScroller;
