import {notFound} from "next/navigation";
import {AdminRecordExplorer} from "@/components/admin-record-explorer";
import {isDataset,publicFilters} from "@/lib/admin-explorer";
export default async function Page({params,searchParams}:{params:Promise<{dataset:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {dataset}=await params;if(!isDataset(dataset))notFound();
 const initial=publicFilters(await searchParams);
 return <AdminRecordExplorer key={`${dataset}:${JSON.stringify(initial)}`} dataset={dataset} initial={initial}/>;
}
