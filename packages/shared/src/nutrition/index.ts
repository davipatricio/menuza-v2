/**
 * Nutrition label contract, calculations and view model. Shared by the panel,
 * the public API and the storefront; pure and browser-safe.
 */
export {
  FRONT_OF_PACK_RULES,
  NUTRIENTS,
  basisUnit,
  frontOfPackThreshold,
  isFrontOfPackRecommended,
  isNonSignificant,
  kilojoules,
  milliToAmount,
  perPortionMg,
  percentDv,
  recommendedFrontOfPack,
  roundNutrient,
  selectedFrontOfPack,
} from "./nutrients.ts";

export type {
  FrontOfPackKey,
  FrontOfPackRule,
  NutrientDefinition,
  NutrientKey,
  NutritionBasis,
  NutritionInput,
  NutritionLabelFormat,
  NutritionSource,
  RoundedValue,
} from "./nutrients.ts";

export { FRONT_OF_PACK_ORDER, buildNutritionLabel, formatAmount } from "./label.ts";

export type {
  NutritionAlert,
  NutritionCell,
  NutritionLabelModel,
  NutritionRowModel,
  NutritionView,
  NutritionViewMode,
} from "./label.ts";
