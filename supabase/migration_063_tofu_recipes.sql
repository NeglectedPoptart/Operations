-- Adds a handful of tofu mains to the Meal Plans recipe database, following
-- the same flavor families already in the list (garlic-herb, honey-garlic,
-- BBQ, teriyaki, taco) so they slot into an existing week's plan as a
-- meat-free swap. Guarded per-name so re-running this migration is
-- harmless.

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Crispy Baked Tofu (Garlic-Herb)', '2 blocks (14-16oz each) - ~6 servings mixed adult/kid',
  ARRAY[
    '2 blocks (14-16oz each) extra-firm tofu, pressed',
    '2 tbsp olive oil',
    '2 tbsp cornstarch',
    '1 tsp garlic powder',
    '1 tsp onion powder',
    '1 tsp smoked paprika',
    '1 tsp dried oregano',
    '3/4 tsp salt',
    '1/4 tsp black pepper'
  ],
  ARRAY[
    'Preheat oven to 425F. Line a sheet pan with parchment.',
    'Press tofu 15-20 min to remove excess water, then cut into 1-inch cubes.',
    'Toss cubes with olive oil, then sprinkle cornstarch and seasonings over top; toss again until evenly coated.',
    'Spread in a single layer, not touching, on the sheet pan.',
    'Bake 25-30 min, flipping halfway, until golden and crisp on the edges.'
  ],
  'Cornstarch is what gets the crispy edges - don''t skip it.'
where not exists (select 1 from recipes where name = 'Crispy Baked Tofu (Garlic-Herb)');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Honey-Garlic Tofu', '2 blocks (14-16oz each) - ~6 servings mixed adult/kid',
  ARRAY[
    '2 blocks (14-16oz each) extra-firm tofu, pressed and cubed',
    '2 tbsp cornstarch',
    '2 tbsp oil, for pan-frying',
    '3 tbsp honey',
    '3 tbsp soy sauce',
    '3 cloves garlic, minced (or 1 1/2 tsp garlic powder)',
    '1 tbsp rice vinegar'
  ],
  ARRAY[
    'Toss cubed tofu with cornstarch until lightly coated.',
    'Heat oil in a large skillet over medium-high heat. Add tofu in a single layer; pan-fry 8-10 min, turning occasionally, until golden on most sides.',
    'Meanwhile whisk honey, soy sauce, garlic and rice vinegar in a small bowl.',
    'Pour the sauce over the tofu, reduce heat to medium, and toss 1-2 min until the sauce thickens and coats.',
    'Cool, then portion over rice.'
  ],
  null
where not exists (select 1 from recipes where name = 'Honey-Garlic Tofu');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'BBQ Baked Tofu', '2 blocks (14-16oz each) - ~6 servings mixed adult/kid',
  ARRAY[
    '2 blocks (14-16oz each) extra-firm tofu, pressed and cut into slabs or cubes',
    '1 tbsp oil',
    '1 cup BBQ sauce, divided',
    '1/2 tsp garlic powder',
    '1/2 tsp smoked paprika'
  ],
  ARRAY[
    'Preheat oven to 400F. Line a sheet pan with parchment.',
    'Toss tofu with oil, garlic powder and paprika, then arrange on the sheet pan.',
    'Bake 15 min, flip, brush generously with half the BBQ sauce, and bake 10 more minutes.',
    'Toss with the remaining BBQ sauce while still warm, then cool before portioning.'
  ],
  'Cut into slabs instead of cubes if you want it to stand in for pulled chicken in a sandwich or wrap.'
where not exists (select 1 from recipes where name = 'BBQ Baked Tofu');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Tofu Teriyaki Stir-Fry', '2 blocks (14-16oz each) - ~6 servings mixed adult/kid',
  ARRAY[
    '2 blocks (14-16oz each) extra-firm tofu, pressed and cubed',
    '2 tbsp cornstarch, divided',
    '2 tbsp oil',
    '1 lb broccoli florets',
    '2 carrots, thinly sliced',
    '3 cloves garlic, minced',
    '1 tsp fresh ginger, grated (or 1/2 tsp ground ginger)',
    '1/3 cup soy sauce',
    '3 tbsp honey',
    '1 tbsp rice vinegar',
    '2 tbsp water'
  ],
  ARRAY[
    'Toss cubed tofu with 1 tbsp cornstarch. Whisk the remaining 1 tbsp cornstarch with the water to make a slurry; set aside with the soy sauce, honey and rice vinegar.',
    'Heat oil in a large skillet or wok over medium-high heat. Add tofu in a single layer; pan-fry 6-8 min, turning occasionally, until golden. Remove and set aside.',
    'Add carrots, cook 2 min, then broccoli, cook 3-4 min until bright green and just tender.',
    'Add garlic and ginger, cook 30 seconds, then return the tofu to the pan.',
    'Pour in the soy sauce, honey and rice vinegar; add the cornstarch slurry and cook 1-2 min until glossy and thickened.',
    'Cool, then portion over rice.'
  ],
  null
where not exists (select 1 from recipes where name = 'Tofu Teriyaki Stir-Fry');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Mild Tofu Taco Crumble', '2 blocks (14-16oz each) - ~6 servings mixed adult/kid',
  ARRAY[
    '2 blocks (14-16oz each) extra-firm tofu, pressed',
    '1 tbsp oil',
    '1 small onion, diced',
    '2 cloves garlic, minced (or 1 tsp garlic powder)',
    '2 tbsp mild taco seasoning',
    '1/4 cup water or broth'
  ],
  ARRAY[
    'Heat oil in a large skillet over medium heat. Add onion, cook 3 min until soft.',
    'Add garlic, cook 30 seconds.',
    'Crumble the tofu into the skillet by hand (aim for pea-to-bean sized pieces); cook 6-8 min, stirring occasionally, until lightly golden and most of the moisture has cooked off.',
    'Stir in taco seasoning and water/broth; simmer 3-4 min until slightly thickened.',
    'Cool, then portion.'
  ],
  'Serve over rice with black beans, corn and cheese, or wrapped in a tortilla, same as the turkey taco meat.'
where not exists (select 1 from recipes where name = 'Mild Tofu Taco Crumble');
