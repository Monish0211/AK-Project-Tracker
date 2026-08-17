import { ConfidentialClientApplication } from "@azure/msal-node";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";

/**
 * Server-side-only Microsoft Graph authentication — OAuth2 client-
 * credentials flow (Application permission, Mail.Read), exactly per the
 * approved Phase 3.8 design. Never runs in, or is reachable from, the
 * frontend; credentials come only from Backend/.env (never source, never
 * committed — see .env.example).
 *
 * NOT YET VERIFIED against a real Microsoft Entra tenant — no Graph
 * credentials have been supplied to this environment as of this phase. The
 * code below is a correct, standard MSAL client-credentials implementation,
 * but "correct in principle" and "proven against the real tenant" are
 * different claims; the final report is explicit about which this is.
 */

export function isGraphConfigured(): boolean {
  return !!(
    env.MICROSOFT_TENANT_ID &&
    env.MICROSOFT_CLIENT_ID &&
    env.MICROSOFT_CLIENT_SECRET &&
    env.KEKA_MAILBOX &&
    env.KEKA_SENDER_EMAIL &&
    env.KEKA_ATTACHMENT_NAME
  );
}
let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (!isGraphConfigured()) {
    throw new AppError(
      "Microsoft Graph is not configured (MICROSOFT_TENANT_ID/MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET/KEKA_MAILBOX/KEKA_SENDER_EMAIL/KEKA_ATTACHMENT_NAME).",
      503
    );
  }

  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: env.MICROSOFT_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}`,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      },
    });
  }

  return msalClient;
}

/** Acquires (and lets MSAL internally cache/refresh) an Application-permission access token scoped to Graph's default scope. */
export async function getGraphAccessToken(): Promise<string> {
  const client = getMsalClient();

  const result = await client.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result?.accessToken) {
    throw new AppError("Failed to acquire a Microsoft Graph access token.", 502);
  }

  return result.accessToken;
}
