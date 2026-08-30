-- Seeds the Meal Plans recipe database (migration_061) with every recipe
-- that was in the old "Batch & Bowl" artifact (a hardcoded personal plan
-- that was cancelled and never shipped as a feature) - the user asked for
-- the recipes themselves to carry over into the new growing database.
-- Each insert is guarded by name so re-running this migration is harmless
-- and won't create duplicates.

-- Mains -----------------------------------------------------------------

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Garlic-Herb Baked Chicken Thighs', '3 lb raw - ~9 servings mixed adult/kid',
  ARRAY[
    '3 lb boneless, skinless chicken thighs',
    '2 tbsp olive oil',
    '1 1/2 tsp garlic powder',
    '1 tsp onion powder',
    '1 tsp smoked paprika',
    '1 tsp dried oregano',
    '1 tsp kosher salt',
    '1/2 tsp black pepper'
  ],
  ARRAY[
    'Preheat oven to 400F. Line a sheet pan with foil or parchment.',
    'Pat chicken dry. Toss in a bowl with the oil and all the seasonings until evenly coated.',
    'Spread in a single layer on the sheet pan.',
    'Bake 25-30 min, flipping once halfway, until it hits 165F inside.',
    'Rest 5 min, then slice or leave whole. Cool before portioning into containers.'
  ],
  'Roast the broccoli & carrots on a second sheet pan for the oven''s last 15 min so both finish together.'
where not exists (select 1 from recipes where name = 'Garlic-Herb Baked Chicken Thighs');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Mild Turkey Taco Meat', '2 lb raw - ~8 servings mixed adult/kid',
  ARRAY[
    '2 lb ground turkey (or 80/20 ground beef)',
    '1 tbsp oil, for the pan',
    '1 small onion, diced',
    '2 cloves garlic, minced (or 1 tsp garlic powder)',
    '2 tbsp mild taco seasoning',
    '1/4 cup water or broth'
  ],
  ARRAY[
    'Heat oil in a large skillet over medium heat. Add onion, cook 3 min until soft.',
    'Add garlic, cook 30 seconds.',
    'Add turkey, breaking it up with a spoon; cook 6-8 min until no longer pink.',
    'Stir in taco seasoning and water/broth; simmer 3-4 min until slightly thickened.',
    'Cool, then portion. Save 1 tbsp of the seasoning packet for the black bean bowl.'
  ],
  'Serve over rice with black beans, corn and cheese, or wrapped in a tortilla for a hand-held version.'
where not exists (select 1 from recipes where name = 'Mild Turkey Taco Meat');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Southwest Black Beans', '3 cans - fills 2 bowls + kid portions',
  ARRAY[
    '3 (15oz) cans black beans, drained and rinsed',
    '1 tbsp olive oil or butter',
    '1 tbsp reserved taco seasoning (or 1/2 tsp cumin + 1/2 tsp chili powder)',
    'to serve: rice, steamed corn, shredded cheese, salsa, sour cream'
  ],
  ARRAY[
    'Warm oil in a small pot over medium heat. Add beans and seasoning.',
    'Simmer 5 min, mashing about a quarter of the beans with a fork for a creamier texture.',
    'Cool and store separately from the rice/corn/cheese - assemble each bowl fresh: rice, beans, corn, then cheese, salsa and sour cream on top.'
  ],
  null
where not exists (select 1 from recipes where name = 'Southwest Black Beans');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'BBQ Pulled Chicken', '2.5 lb raw - slow cooker',
  ARRAY[
    '2.5 lb boneless, skinless chicken breasts or thighs',
    '1 cup BBQ sauce',
    '1/4 cup chicken broth or water',
    '1/2 tsp garlic powder',
    '1/2 tsp smoked paprika (optional)'
  ],
  ARRAY[
    'Place chicken in the slow cooker. Pour the BBQ sauce, broth and seasonings over it.',
    'Cook on low 6-7 hrs or high 3-4 hrs, until it shreds easily.',
    'Remove chicken, shred with two forks, then return to the sauce and stir to coat.',
    'Cool before portioning.'
  ],
  'Start this before you leave in the morning - it just needs to be turned on.'
where not exists (select 1 from recipes where name = 'BBQ Pulled Chicken');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Honey-Garlic Chicken', '2.5 lb raw - sheet pan',
  ARRAY[
    '2.5 lb boneless, skinless chicken thighs',
    '3 tbsp honey',
    '3 tbsp soy sauce',
    '3 cloves garlic, minced (or 1 1/2 tsp garlic powder)',
    '1 tbsp olive oil',
    '1/2 tsp black pepper'
  ],
  ARRAY[
    'Preheat oven to 400F. Whisk honey, soy sauce, garlic, oil and pepper in a bowl.',
    'Toss chicken in the marinade - a 10 min sit helps but isn''t required.',
    'Arrange on a lined sheet pan, spoon any extra marinade over the top.',
    'Bake 25 min, until 165F inside and the edges start to caramelize.',
    'Rest 5 min, slice, then portion once cool.'
  ],
  'Roast the fresh potatoes tray alongside - same oven, same 25 minutes.'
where not exists (select 1 from recipes where name = 'Honey-Garlic Chicken');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Rice', '3 cups dry -> ~9 cups cooked',
  ARRAY[
    '3 cups dry white rice',
    '6 cups water',
    '1/2 tsp salt'
  ],
  ARRAY[
    'Rinse rice until the water runs mostly clear.',
    'Combine with water and salt in a large pot; bring to a boil.',
    'Cover, reduce to a low simmer, cook 15-18 min until water is absorbed.',
    'Rest covered, off heat, 5 min, then fluff with a fork.'
  ],
  null
where not exists (select 1 from recipes where name = 'Rice');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Roasted Potatoes', '4 lb, split across two roasts',
  ARRAY[
    '4 lb Yukon gold or russet potatoes, cut into 1-inch cubes',
    '3 tbsp olive oil',
    '1 tsp salt',
    '1/2 tsp black pepper',
    '1 tsp garlic powder',
    '1 tsp paprika'
  ],
  ARRAY[
    'Preheat oven to 400F. Toss potatoes with oil and seasonings.',
    'Spread in a single layer on a sheet pan (don''t crowd, or they''ll steam instead of crisp).',
    'Roast 25-30 min, flipping halfway, until golden and fork-tender.'
  ],
  'Made fresh both Wednesdays - Batch B needs its own tray, not a leftover from Sunday.'
where not exists (select 1 from recipes where name = 'Roasted Potatoes');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Roasted Broccoli & Carrots', '1 lb each',
  ARRAY[
    '1 lb broccoli florets',
    '1 lb carrots, sliced into coins',
    '2 tbsp olive oil',
    '1/2 tsp salt',
    '1/4 tsp black pepper'
  ],
  ARRAY[
    'Toss both vegetables with oil, salt and pepper.',
    'Spread on a sheet pan and slide into the oven alongside the chicken for its last 15 min.',
    'Roast until lightly browned at the edges and fork-tender.'
  ],
  null
where not exists (select 1 from recipes where name = 'Roasted Broccoli & Carrots');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Steamed Frozen Corn / Green Beans', '1 bag per side',
  ARRAY[
    '1 bag frozen corn (for taco & black bean bowls)',
    '1 bag frozen green beans or peas (for BBQ & honey-garlic bowls)'
  ],
  ARRAY[
    'Microwave each bag per its package instructions (usually 4-5 min), or steam on the stovetop 5 min.',
    'Cool before portioning into containers.'
  ],
  null
where not exists (select 1 from recipes where name = 'Steamed Frozen Corn / Green Beans');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Turkey Fried Rice', '2 lb raw - ~8 servings mixed adult/kid',
  ARRAY[
    '2 lb ground turkey',
    '1 tbsp oil',
    '1 small onion, diced',
    '2 cloves garlic, minced',
    '3 cups cooked rice (day-old/cooled works best)',
    '1 cup frozen peas & carrots',
    '3 eggs, beaten',
    '3 tbsp soy sauce',
    '1 tsp sesame oil (optional)'
  ],
  ARRAY[
    'Heat oil in a large skillet or wok over medium-high. Add onion, cook 2 min.',
    'Add garlic, cook 30 seconds, then add turkey; cook until browned, 6-8 min.',
    'Push turkey to one side, pour beaten eggs into the empty space, scramble until just set, then mix in.',
    'Add peas & carrots, cook 2 min.',
    'Add rice, breaking up clumps; stir-fry 3-4 min until heated through.',
    'Add soy sauce and sesame oil, toss to coat. Cool, then portion.'
  ],
  'A good way to use up rice that''s a day or two old instead of tossing it.'
where not exists (select 1 from recipes where name = 'Turkey Fried Rice');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Turkey & Black Bean Chili', '2 lb raw - ~8 servings mixed adult/kid',
  ARRAY[
    '2 lb ground turkey',
    '1 tbsp oil',
    '1 onion, diced',
    '2 cloves garlic, minced',
    '1 (15oz) can black beans, drained',
    '1 (28oz) can diced tomatoes',
    '1 tbsp chili powder',
    '1 tsp cumin',
    '1/2 tsp smoked paprika',
    '1/2 tsp salt',
    '1/2 cup water or broth'
  ],
  ARRAY[
    'Heat oil in a large pot over medium heat. Add onion, cook 3 min, then garlic, 30 seconds.',
    'Add turkey, cook until browned, breaking it up, 6-8 min.',
    'Stir in beans, tomatoes, spices, and water/broth.',
    'Simmer uncovered 20-25 min, stirring occasionally, until it thickens to your liking.',
    'Cool, portion. Top with cheese on reheat if you''d like.'
  ],
  'Mild as written. Keep hot sauce on the side for your own bowl.'
where not exists (select 1 from recipes where name = 'Turkey & Black Bean Chili');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Turkey & Sweet Potato Skillet Hash', '2 lb raw - ~8 servings mixed adult/kid',
  ARRAY[
    '2 lb ground turkey',
    '1 tbsp olive oil',
    '2 medium sweet potatoes, peeled and diced small (1/2-inch)',
    '1 small onion, diced',
    '1 tsp smoked paprika',
    '1/2 tsp garlic powder',
    '1/2 tsp salt',
    '1/4 tsp black pepper'
  ],
  ARRAY[
    'Heat oil in a large skillet over medium heat. Add sweet potato, cover, and cook 8-10 min, stirring occasionally, until fork-tender.',
    'Push sweet potato to the side, add onion, cook 2-3 min until soft.',
    'Add ground turkey, breaking it up; cook 6-8 min until browned with no pink left.',
    'Stir in paprika, garlic powder, salt and pepper; mix everything together and cook 2 more minutes.',
    'Cool, then portion.'
  ],
  'Top with a fried egg if eating it fresh - skip that for the fridge/microwave portions.'
where not exists (select 1 from recipes where name = 'Turkey & Sweet Potato Skillet Hash');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Turkey Meatloaf', '2 lb raw - one loaf, ~8 slices',
  ARRAY[
    '2 lb ground turkey',
    '1 cup breadcrumbs (plain or panko)',
    '2 eggs',
    '1/2 cup milk',
    '1 small onion, finely diced or grated',
    '2 cloves garlic, minced (or 1 tsp garlic powder)',
    '1 tsp salt',
    '1/2 tsp black pepper',
    '1/2 cup ketchup, divided',
    '2 tbsp brown sugar',
    '1 tsp mustard'
  ],
  ARRAY[
    'Preheat oven to 375F. Line a loaf pan, or shape free-form on a lined sheet pan.',
    'In a large bowl, combine turkey, breadcrumbs, eggs, milk, onion, garlic, salt, pepper and 1/4 cup ketchup. Mix gently - don''t overwork it.',
    'Shape into a loaf and place in the pan.',
    'Mix the remaining 1/4 cup ketchup with the brown sugar and mustard; spread over the top.',
    'Bake 50-60 min, until it hits 165F inside.',
    'Rest 10 min before slicing. Cool, then portion.'
  ],
  'Slices cleanly once cold - good in a bowl with a side, or as sandwich filling through the week.'
where not exists (select 1 from recipes where name = 'Turkey Meatloaf');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'main', 'Turkey Teriyaki Stir-Fry', '2 lb raw - ~8 servings mixed adult/kid',
  ARRAY[
    '2 lb ground turkey',
    '1 tbsp oil',
    '1 lb broccoli florets',
    '2 carrots, thinly sliced',
    '3 cloves garlic, minced',
    '1 tsp fresh ginger, grated (or 1/2 tsp ground ginger)',
    '1/3 cup soy sauce',
    '3 tbsp honey',
    '1 tbsp rice vinegar',
    '1 tbsp cornstarch + 2 tbsp water (slurry)'
  ],
  ARRAY[
    'Whisk together the soy sauce, honey and rice vinegar in a small bowl. Separately, mix the cornstarch with water.',
    'Heat oil in a large skillet or wok over medium-high heat. Add carrots, cook 2 min, then broccoli, cook 3-4 min until bright green and just tender.',
    'Push vegetables to the side; add turkey, garlic and ginger. Cook 6-8 min, breaking up the turkey, until browned.',
    'Combine turkey and vegetables. Pour in the sauce, stir to coat, then add the cornstarch slurry and cook 1-2 min until glossy and thickened.',
    'Cool, then portion over rice.'
  ],
  'Same honey-soy-garlic flavor family as the Wednesday chicken, but with turkey and extra veg instead.'
where not exists (select 1 from recipes where name = 'Turkey Teriyaki Stir-Fry');

-- Snacks ------------------------------------------------------------------

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'Hard-Boiled Eggs', '1 dozen, for snacks',
  ARRAY[
    '12 eggs',
    'water, to cover'
  ],
  ARRAY[
    'Place eggs in a pot, cover with water by about an inch.',
    'Bring to a boil, then cover and remove from heat. Let sit 10-12 min.',
    'Transfer to an ice bath to stop cooking, then peel - or leave in the shell and peel as you go through the week.'
  ],
  null
where not exists (select 1 from recipes where name = 'Hard-Boiled Eggs');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'String Cheese', null,
  ARRAY['String cheese sticks'],
  ARRAY[]::text[],
  'Grab-and-go, no prep.'
where not exists (select 1 from recipes where name = 'String Cheese');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'Apple or Banana with Peanut Butter', null,
  ARRAY['1 apple or banana', '2 tbsp peanut butter'],
  ARRAY[]::text[],
  'Grab-and-go, no prep.'
where not exists (select 1 from recipes where name = 'Apple or Banana with Peanut Butter');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'Carrot & Celery Sticks with Ranch', null,
  ARRAY['Carrot sticks', 'Celery sticks', 'Ranch dip'],
  ARRAY[]::text[],
  'Grab-and-go, no prep.'
where not exists (select 1 from recipes where name = 'Carrot & Celery Sticks with Ranch');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'Popcorn', null,
  ARRAY['Popcorn (air-popped or microwave bag)'],
  ARRAY['Pop according to package instructions.'],
  null
where not exists (select 1 from recipes where name = 'Popcorn');

insert into recipes (recipe_type, name, servings, ingredients, steps, notes)
select 'snack', 'Pretzels & Trail Mix', null,
  ARRAY['Pretzels', 'Small handful of raisins or peanuts'],
  ARRAY[]::text[],
  'Grab-and-go, no prep.'
where not exists (select 1 from recipes where name = 'Pretzels & Trail Mix');
