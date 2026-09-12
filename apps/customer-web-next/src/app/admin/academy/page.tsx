import type { Metadata } from "next";
import AcademyDashboard from "./AcademyDashboard";
import "./academy.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Craves Academy | Internal learning", robots: { index: false, follow: false } };
export default function AcademyPage() { return <AcademyDashboard />; }
