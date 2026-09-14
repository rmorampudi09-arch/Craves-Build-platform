import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {AdminDashboard} from "@/components/admin-dashboard";
export default function AdminPage(){
 return <><Link href="/admin/analytics" className="cr-panel" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:24}}><span><strong>Marketplace analytics & all records</strong><span className="cr-muted" style={{display:"block"}}>Users, chefs and orders — click a graph and explore the full filtered list.</span></span><ArrowRight size={22} aria-hidden="true"/></Link><AdminDashboard/></>;
}
