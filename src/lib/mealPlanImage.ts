// Canvas renderer for the Meal Plans "Generate Breakdown" image - full
// recipe details (ingredients + steps) for every recipe in the plan,
// followed by a consolidated buy list. Deliberately its own module rather
// than reusing fobPriceSheetImage.ts (that one is FOB/Delivered pricing
// only - see its header comment) or fobPricing.ts's renderPriceSheetPng
// (built around a price-grid shape, not free-text recipe content). Same
// canvas-only approach as both of those: never draw an SVG/foreignObject to
// canvas, since Chromium taints it and toBlob()/toDataURL() throw
// unconditionally regardless of content.

export interface MealPlanBreakdownRecipe {
  name: string;
  servings: string | null;
  ingredients: string[];
  steps: string[];
  notes: string | null;
}

export interface MealPlanBuyListEntry {
  label: string;
  count: number;
}

export interface MealPlanBreakdownInput {
  title: string;
  periodLabel: string;
  recipes: MealPlanBreakdownRecipe[];
  buyList: MealPlanBuyListEntry[];
}

const WIDTH = 900;
const MARGIN = 40;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;

const COLORS = {
  headerFrom: "#4A2545",
  headerTo: "#8B5A6B",
  accent: "#8B5A6B",
  cardBg: "#FBF7F2",
  cardBorder: "#E4D7C6",
  text: "#2A1F26",
  textMuted: "#6B5C63",
  buyListBg: "#4A2545",
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// One recipe card's line layout, computed once with the measuring context
// and reused for both the height pass and the draw pass so the two never
// disagree.
interface RecipeLayout {
  recipe: MealPlanBreakdownRecipe;
  ingredientLines: string[];
  stepLines: { number: number; lines: string[] }[];
  noteLines: string[];
  height: number;
}

function layoutRecipe(ctx: CanvasRenderingContext2D, recipe: MealPlanBreakdownRecipe): RecipeLayout {
  const innerWidth = CONTENT_WIDTH - 48;
  let height = 22 + 32; // top padding + name row

  ctx.font = "13px Arial";
  const ingredientLines = recipe.ingredients.flatMap((line) => wrapText(ctx, `- ${line}`, innerWidth));
  if (recipe.ingredients.length > 0) {
    height += 20 + ingredientLines.length * 19;
  }

  const stepLines = recipe.steps.map((step, idx) => ({
    number: idx + 1,
    lines: wrapText(ctx, step, innerWidth - 26),
  }));
  if (recipe.steps.length > 0) {
    height += 20 + stepLines.reduce((sum, s) => sum + s.lines.length * 19, 0);
  }

  const noteLines = recipe.notes ? wrapText(ctx, recipe.notes, innerWidth) : [];
  if (noteLines.length > 0) {
    height += 16 + noteLines.length * 17;
  }

  height += 24; // bottom padding
  return { recipe, ingredientLines, stepLines, noteLines, height };
}

function drawRecipeCard(ctx: CanvasRenderingContext2D, layout: RecipeLayout, x: number, y: number, width: number) {
  const { recipe } = layout;
  drawRoundedRect(ctx, x, y, width, layout.height, 10);
  ctx.fillStyle = COLORS.cardBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(x, y, 6, layout.height);

  let cy = y + 22;
  const cx = x + 24;
  const innerWidth = width - 48;

  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 18px Arial";
  ctx.textBaseline = "top";
  ctx.fillText(recipe.name, cx, cy);
  if (recipe.servings) {
    const nameWidth = ctx.measureText(recipe.name).width;
    ctx.font = "13px Arial";
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(`  -  Serves ${recipe.servings}`, cx + nameWidth, cy + 3);
  }
  cy += 32;

  if (layout.ingredientLines.length > 0) {
    ctx.font = "bold 12px Arial";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("INGREDIENTS", cx, cy);
    cy += 20;
    ctx.font = "13px Arial";
    ctx.fillStyle = COLORS.text;
    for (const line of layout.ingredientLines) {
      ctx.fillText(line, cx, cy);
      cy += 19;
    }
  }

  if (layout.stepLines.length > 0) {
    ctx.font = "bold 12px Arial";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("STEPS", cx, cy);
    cy += 20;
    ctx.font = "13px Arial";
    ctx.fillStyle = COLORS.text;
    for (const step of layout.stepLines) {
      ctx.fillText(`${step.number}.`, cx, cy);
      for (const line of step.lines) {
        ctx.fillText(line, cx + 22, cy);
        cy += 19;
      }
    }
  }

  if (layout.noteLines.length > 0) {
    ctx.font = "italic 12px Arial";
    ctx.fillStyle = COLORS.textMuted;
    cy += 4;
    for (const line of layout.noteLines) {
      ctx.fillText(line, cx, cy);
      cy += 17;
    }
  }

  void innerWidth;
}

function layoutBuyListColumns(ctx: CanvasRenderingContext2D, entries: MealPlanBuyListEntry[], columns: number, colWidth: number) {
  ctx.font = "13px Arial";
  const perColumn = Math.ceil(entries.length / columns);
  const columnLines: string[][] = [];
  for (let c = 0; c < columns; c++) {
    const slice = entries.slice(c * perColumn, (c + 1) * perColumn);
    columnLines.push(
      slice.map((e) => (e.count > 1 ? `${e.label}  (x${e.count})` : e.label)).flatMap((t) => wrapText(ctx, t, colWidth - 20)),
    );
  }
  return columnLines;
}

export async function renderMealPlanBreakdownPng(input: MealPlanBreakdownInput, scale = 2): Promise<Blob> {
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas not supported");

  const recipeLayouts = input.recipes.map((r) => layoutRecipe(mctx, r));

  let height = 0;
  height += 120; // header
  height += recipeLayouts.reduce((sum, l) => sum + l.height + 18, 0);

  const hasBuyList = input.buyList.length > 0;
  const buyListColumns = 2;
  const buyListColWidth = (CONTENT_WIDTH - 48 - (buyListColumns - 1) * 24) / buyListColumns;
  const buyListColumnLines = hasBuyList ? layoutBuyListColumns(mctx, input.buyList, buyListColumns, buyListColWidth) : [];
  const buyListLineCount = hasBuyList ? Math.max(...buyListColumnLines.map((c) => c.length)) : 0;
  let buyListHeight = 0;
  if (hasBuyList) {
    buyListHeight = 56 + buyListLineCount * 20 + 24;
    height += 24 + buyListHeight;
  }

  height += 40; // bottom margin

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, WIDTH, height);

  const headerGradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
  headerGradient.addColorStop(0, COLORS.headerFrom);
  headerGradient.addColorStop(1, COLORS.headerTo);
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, WIDTH, 96);

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = "bold 30px Arial";
  ctx.fillText(input.title, MARGIN, 26);
  ctx.font = "14px Arial";
  ctx.fillStyle = "#E9DCE0";
  ctx.fillText(input.periodLabel, MARGIN, 64);

  let y = 120;
  for (const layout of recipeLayouts) {
    drawRecipeCard(ctx, layout, MARGIN, y, CONTENT_WIDTH);
    y += layout.height + 18;
  }

  if (hasBuyList) {
    drawRoundedRect(ctx, MARGIN, y, CONTENT_WIDTH, buyListHeight, 10);
    ctx.fillStyle = COLORS.buyListBg;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px Arial";
    ctx.fillText("BUY LIST", MARGIN + 24, y + 20);

    const colTop = y + 56;
    for (let c = 0; c < buyListColumnLines.length; c++) {
      const colX = MARGIN + 24 + c * (buyListColWidth + 24);
      let cy = colTop;
      ctx.font = "13px Arial";
      ctx.fillStyle = "#F3EAEE";
      for (const line of buyListColumnLines[c]) {
        ctx.fillText(`- ${line}`, colX, cy);
        cy += 20;
      }
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export meal plan image"));
    }, "image/png");
  });
}
