/**
 * Menù generato (docs/FASE2.md § 4.10-4.11): l'accesso unico per le schermate e per il coach.
 * - `buildMenuProposal(ctx)`: la proposta del menù della settimana dopo dal `BuildContext` dei generatori;
 * - `isMenuProposalTime(oggi, ora)`, `menuProposalMonday`, `menuProposalShopping` (spesa prima e dopo, «Da comprare in più»);
 * - `generateMenuWeek(input)`, `menuGenInput(lunedì, stato)`, `validateMenuWeek(settimana, contesto)`, `prepTasksFor(settimana)`.
 */
export { menuDaysFor, menuGenInput, validationCtxOf, MAX_EVALUATIONS, FIBER_STEP } from './context';
export type { MenuDayCtx, MenuGenInput, MenuGenResult, MenuGenStatus, MenuGenState, MenuValidationCtx, MenuGenOptions } from './context';
export { generateMenuWeek, menuCellPool, menuWeekCost } from './generate';
export { prepPlan, prepTasksFor, prepYield, sameBatchLayout } from './prep';
export type { PrepPlanItem } from './prep';
export { buildMenuProposal, isMenuProposalTime, menuProposalMonday, menuProposalShopping, proposalMeals, MENU_PROPOSAL_FROM } from './proposal';
export type { MenuBuildContext, MenuProposalShopping } from './proposal';
export { isMenuWeekValid, menuWeekSummary, validateMenuWeek } from './validate';
export type { MenuWeekSummary } from './validate';
