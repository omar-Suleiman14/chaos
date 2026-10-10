import { integrationScopes, type IntegrationScope } from "./integrationModel";

export function validScopes(scopes: IntegrationScope[]): IntegrationScope[] {
  const unique = [...new Set(scopes)];
  if (!unique.length) throw new Error("INVALID_SCOPES: Choose at least one permission.");
  return integrationScopes.filter((s) => unique.includes(s));
}
