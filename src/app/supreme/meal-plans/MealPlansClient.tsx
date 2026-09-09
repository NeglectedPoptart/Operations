"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { copyOrDownloadPng } from "@/lib/fobPricing";
import { renderMealPlanBreakdownPng, type MealPlanBreakdownInput } from "@/lib/mealPlanImage";
import type { Recipe, RecipeType } from "@/lib/types";
import { createRecipe, deleteRecipe, updateRecipe } from "./actions";

const field =
  "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
const buttonPrimary = "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800";
const buttonSecondary =
  "rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

interface RecipeDraft {
  name: string;
  servings: string;
  ingredients: string;
  steps: string;
  notes: string;
}

const emptyDraft: RecipeDraft = { name: "", servings: "", ingredients: "", steps: "", notes: "" };

function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    name: recipe.name,
    servings: recipe.servings ?? "",
    ingredients: recipe.ingredients.join("\n"),
    steps: recipe.steps.join("\n"),
    notes: recipe.notes ?? "",
  };
}

function draftToPatch(draft: RecipeDraft) {
  return {
    name: draft.name.trim(),
    servings: draft.servings.trim() || null,
    ingredients: draft.ingredients.split("\n").map((l) => l.trim()).filter(Boolean),
    steps: draft.steps.split("\n").map((l) => l.trim()).filter(Boolean),
    notes: draft.notes.trim() || null,
  };
}

function RecipeForm({
  draft,
  onChange,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={field}
          placeholder="Recipe name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <input
          className={field}
          placeholder="Servings (e.g. 4)"
          value={draft.servings}
          onChange={(e) => onChange({ ...draft, servings: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
          Ingredients (one per line)
        </label>
        <textarea
          className={field}
          rows={4}
          value={draft.ingredients}
          onChange={(e) => onChange({ ...draft, ingredients: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">Steps (one per line)</label>
        <textarea
          className={field}
          rows={4}
          value={draft.steps}
          onChange={(e) => onChange({ ...draft, steps: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">Notes (optional)</label>
        <input
          className={field}
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className={buttonPrimary} disabled={!draft.name.trim()}>
          {saveLabel}
        </button>
        <button onClick={onCancel} className={buttonSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  selected,
  onToggleSelected,
  onSave,
  onDelete,
}: {
  recipe: Recipe;
  selected: boolean;
  onToggleSelected: () => void;
  onSave: (patch: Partial<Pick<Recipe, "name" | "servings" | "ingredients" | "steps" | "notes">>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft>(() => draftFromRecipe(recipe));

  function startEdit() {
    setDraft(draftFromRecipe(recipe));
    setEditing(true);
    setExpanded(true);
  }

  function handleSave() {
    onSave(draftToPatch(draft));
    setEditing(false);
  }

  return (
    <div className="rounded-md border border-black/10 dark:border-white/10">
      <div className="flex items-center gap-3 px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="h-4 w-4 shrink-0"
          aria-label={`Add ${recipe.name} to plan`}
        />
        <button onClick={() => setExpanded((v) => !v)} className="flex flex-1 items-center justify-between text-left">
          <span className="text-sm font-medium">
            {recipe.name}
            {recipe.servings && <span className="ml-2 text-xs text-black/40 dark:text-white/40">Serves {recipe.servings}</span>}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className={`h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/40 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-black/10 p-3 dark:border-white/10">
          {editing ? (
            <RecipeForm draft={draft} onChange={setDraft} onSave={handleSave} onCancel={() => setEditing(false)} saveLabel="Save" />
          ) : (
            <div className="space-y-3 text-sm">
              {recipe.ingredients.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">
                    Ingredients
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {recipe.ingredients.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.steps.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">Steps</p>
                  <ol className="list-decimal space-y-0.5 pl-5">
                    {recipe.steps.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>
              )}
              {recipe.notes && <p className="italic text-black/60 dark:text-white/60">{recipe.notes}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={startEdit} className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">
                  Edit
                </button>
                <button onClick={onDelete} className="text-xs font-medium text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecipeSection({
  title,
  recipes,
  selectedIds,
  onToggleSelected,
  onAdd,
  onSave,
  onDelete,
}: {
  title: string;
  recipes: Recipe[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onAdd: (draft: RecipeDraft) => void;
  onSave: (id: string, patch: Partial<Pick<Recipe, "name" | "servings" | "ingredients" | "steps" | "notes">>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft);

  function handleAdd() {
    onAdd(draft);
    setDraft(emptyDraft);
    setAdding(false);
  }

  return (
    <section className="space-y-3 print:hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className={buttonSecondary}>
            + Add Recipe
          </button>
        )}
      </div>

      {adding && (
        <RecipeForm draft={draft} onChange={setDraft} onSave={handleAdd} onCancel={() => setAdding(false)} saveLabel="Add" />
      )}

      {recipes.length === 0 && !adding ? (
        <p className="text-sm text-black/40 dark:text-white/40">No recipes yet.</p>
      ) : (
        <div className="space-y-2">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              selected={selectedIds.has(recipe.id)}
              onToggleSelected={() => onToggleSelected(recipe.id)}
              onSave={(patch) => onSave(recipe.id, patch)}
              onDelete={() => onDelete(recipe.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function buildBuyList(recipes: Recipe[]): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = ingredient.trim().toLowerCase();
      if (!key) continue;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label: ingredient.trim(), count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function BreakdownView({
  breakdown,
  onCopyImage,
  imageStatus,
}: {
  breakdown: MealPlanBreakdownInput;
  onCopyImage: () => void;
  imageStatus: string | null;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-lg font-bold">Breakdown</h2>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className={buttonSecondary}>
            Print
          </button>
          <button onClick={onCopyImage} className={buttonPrimary}>
            {imageStatus ?? "Copy as Image"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10 print:border-black">
        <h1 className="text-xl font-bold">{breakdown.title}</h1>
        <p className="mb-4 text-sm text-black/50 dark:text-white/50">{breakdown.periodLabel}</p>

        <div className="space-y-4">
          {breakdown.recipes.map((recipe, i) => (
            <div key={i} className="rounded-md border border-black/10 p-3 dark:border-white/10 print:border-black/40">
              <h3 className="font-bold">
                {recipe.name}
                {recipe.servings && (
                  <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">Serves {recipe.servings}</span>
                )}
              </h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {recipe.ingredients.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">
                      Ingredients
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm">
                      {recipe.ingredients.map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {recipe.steps.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">Steps</p>
                    <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                      {recipe.steps.map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              {recipe.notes && <p className="mt-2 text-sm italic text-black/60 dark:text-white/60">{recipe.notes}</p>}
            </div>
          ))}
        </div>

        {breakdown.buyList.length > 0 && (
          <div className="mt-4 rounded-md bg-black/[0.03] p-3 dark:bg-white/[0.05] print:border print:border-black/40 print:bg-transparent">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-black/50 dark:text-white/50">Buy List</p>
            <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
              {breakdown.buyList.map((entry, i) => (
                <li key={i}>
                  {entry.label}
                  {entry.count > 1 && <span className="text-black/40 dark:text-white/40"> (x{entry.count})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default function MealPlansClient({ initialRecipes }: { initialRecipes: Recipe[] }) {
  const confirm = useConfirm();
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [planTitle, setPlanTitle] = useState("");
  const [periodLabel, setPeriodLabel] = useState("1 Week");
  const [breakdown, setBreakdown] = useState<MealPlanBreakdownInput | null>(null);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const mains = useMemo(
    () => recipes.filter((r) => r.recipe_type === "main").sort((a, b) => a.name.localeCompare(b.name)),
    [recipes],
  );
  const snacks = useMemo(
    () => recipes.filter((r) => r.recipe_type === "snack").sort((a, b) => a.name.localeCompare(b.name)),
    [recipes],
  );

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd(type: RecipeType, draft: RecipeDraft) {
    if (!draft.name.trim()) return;
    const row = await createRecipe({ recipeType: type, ...draftToPatch(draft) });
    setRecipes((prev) => [...prev, row]);
  }

  function handleSave(id: string, patch: Partial<Pick<Recipe, "name" | "servings" | "ingredients" | "steps" | "notes">>) {
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    updateRecipe(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this recipe?"))) return;
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await deleteRecipe(id).catch(() => {});
  }

  function handleGenerateBreakdown() {
    const selected = recipes.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setBreakdown({
      title: planTitle.trim() || "Meal Plan",
      periodLabel,
      recipes: selected.map((r) => ({
        name: r.name,
        servings: r.servings,
        ingredients: r.ingredients,
        steps: r.steps,
        notes: r.notes,
      })),
      buyList: buildBuyList(selected),
    });
  }

  async function handleCopyImage() {
    if (!breakdown) return;
    try {
      const blob = await renderMealPlanBreakdownPng(breakdown);
      const result = await copyOrDownloadPng(blob, "meal-plan-breakdown.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">Meal Plans</h1>
      </div>

      <RecipeSection
        title="Main Recipes"
        recipes={mains}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onAdd={(draft) => handleAdd("main", draft)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <RecipeSection
        title="Snacks"
        recipes={snacks}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onAdd={(draft) => handleAdd("snack", draft)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10 print:hidden">
        <h2 className="text-lg font-bold">Plan Builder</h2>
        <p className="text-sm text-black/50 dark:text-white/50">
          {selectedCount === 0 ? "Check off recipes and snacks above" : `${selectedCount} recipe${selectedCount !== 1 ? "s" : ""} selected`}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className={field}
            placeholder="Plan title (e.g. Week of Sept 1)"
            value={planTitle}
            onChange={(e) => setPlanTitle(e.target.value)}
          />
          <select className={field} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)}>
            <option value="1 Week">1 Week</option>
            <option value="2 Weeks">2 Weeks</option>
          </select>
          <button onClick={handleGenerateBreakdown} className={buttonPrimary} disabled={selectedCount === 0}>
            Generate Breakdown
          </button>
        </div>
      </section>

      {breakdown && <BreakdownView breakdown={breakdown} onCopyImage={handleCopyImage} imageStatus={imageStatus} />}
    </div>
  );
}
