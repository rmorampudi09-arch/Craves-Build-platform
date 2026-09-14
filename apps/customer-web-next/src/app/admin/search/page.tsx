import { AdminGlobalSearch } from "@/components/admin-global-search";
export default async function AdminSearchPage({searchParams}:{searchParams:Promise<{reference?:string}>}){
 const {reference}=await searchParams;
 const initialReference=typeof reference==="string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(reference)?reference:"";
 return <AdminGlobalSearch initialReference={initialReference}/>;
}
