import { featureDefinition } from "#src/lib/core/features.js";
import type { Features } from "#src/lib/core/features.js";
import { form } from "#src/lib/features/form.js";
import { schema } from "#src/lib/features/schema.js";

// The features the root entry installs on every instance, for tests that call dispatchRequest
// directly instead of through an instance.
export const rootFeatures: Features = {};
for (const plugin of [ schema(), form() ]) {
  const definition = featureDefinition(plugin)!;
  if (definition.feature === "schema") rootFeatures.schema = definition.implementation;
  else rootFeatures.form = definition.implementation;
}
