import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/templates";
import { json, route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(() => json({ categories: TEMPLATE_CATEGORIES, templates: TEMPLATES }));
