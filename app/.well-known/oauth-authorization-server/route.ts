// Mirrors Clerk's authorization server metadata for MCP clients that look for it
// on the resource origin instead of following authorization_servers.
import { authServerMetadataHandlerClerk, metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";

export const dynamic = "force-dynamic";

const handler = authServerMetadataHandlerClerk();
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
