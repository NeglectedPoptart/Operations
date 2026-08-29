"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Recipe, RecipeType } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/management/meal-plans");
}

export async function createRecipe(input: {
  recipeType: RecipeType;
  name: string;
  servings: string | null;
  ingredients: string[];
  steps: string[];
  notes: string | null;
}): Promise<Recipe> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      recipe_type: input.recipeType,
      name: input.name.trim(),
      servings: input.servings?.trim() || null,
      ingredients: input.ingredients.map((line) => line.trim()).filter(Boolean),
      steps: input.steps.map((line) => line.trim()).filter(Boolean),
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data as Recipe;
}

export async function updateRecipe(
  id: string,
  patch: Partial<Pick<Recipe, "recipe_type" | "name" | "servings" | "ingredients" | "steps" | "notes">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteRecipe(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
