import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listOrders from "./tools/list-orders";
import getOrder from "./tools/get-order";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "text-to-app-builder",
  title: "Text to App Builder",
  version: "0.1.0",
  instructions:
    "Sky Plus wholesale container ordering. Search the catalogue, list your orders and read order details. All results respect the signed-in account's access.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    requireOAuthClientClaim: true,
  }),
  tools: [searchProducts, listOrders, getOrder],
});
