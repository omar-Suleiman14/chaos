# Setting Up Convex Environment Variable

You need to set the Clerk issuer URL in your Convex deployment so it knows how to verify Clerk JWT tokens.

## Quick Setup

Run this command (replace with YOUR issuer URL from Clerk Dashboard):

```bash
npx convex env set CLERK_ISSUER_URL https://star-leopard-35.clerk.accounts.dev
```

**Where to get YOUR issuer URL:**
1. Go to https://dashboard.clerk.com
2. Select your app → JWT Templates
3. Click on the "convex" template you created
4. Copy the "Issuer" value

## After Setting

The dev server should automatically pick up the change. If not, restart:
```bash
# Stop convex dev (Ctrl+C) and restart:
npx convex dev
```

Then refresh your browser and try logging in again!
