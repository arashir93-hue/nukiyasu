import {useQuery} from "@tanstack/react-query";
import {getDoujinshiOrganization} from "../api/doujinshi";
import {keys} from "./queryKeys";
import type {SerieWithProgress} from "../types/serie";
import type {DoujinshiOrganization} from "../types/doujinshi";

export function useDoujinshiOrganizationBatch(series: SerieWithProgress[] | undefined): {
    organizations: Record<string, DoujinshiOrganization>;
    isLoading: boolean;
} {
    const ids = [...new Set((series ?? []).filter((serie)=>serie.variant === "doujinshi").map((serie)=>serie._id))].sort();
    const query = useQuery({
        queryKey: keys.doujinshiOrganization(ids),
        queryFn: ()=>getDoujinshiOrganization(ids),
        enabled: ids.length > 0,
    });

    return {
        organizations: query.data?.items ?? {},
        isLoading: ids.length > 0 && query.isLoading,
    };
}
