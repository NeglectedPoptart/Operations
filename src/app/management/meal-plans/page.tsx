import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/types";
import MealPlansClient from "./MealPlansClient";

export const dynamic = "force-dynamic";

export default async function MealPlansPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.from("recipes").select("*").order("name", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load recipes: {error.message}</p>;
  }

  return <MealPlansClient initialRecipes={(data ?? []) as Recipe[]} />;
}
