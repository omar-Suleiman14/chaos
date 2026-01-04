# URGENT: Clerk JWT Template Setup Required

## The Issue
You're getting a 404 error because Clerk needs a JWT template configured for Convex.

Error: `tokens/convex?... - 404`

## Fix This in 3 Steps

### Step 1: Go to Clerk Dashboard
1. Open https://dashboard.clerk.com
2. Select your application ("Chaos" or whatever you named it)
3. In the left sidebar, click **JWT Templates**

### Step 2: Create Convex Template
1. Click **+ New template**
2. Select **Convex** from the list (it's a preset!)
3. Name it: `convex`
4. Click **Apply Changes** or **Save**

### Step 3: Get the Issuer URL
After creating the template, you'll see an **Issuer** URL that looks like:
```
https://star-leopard-35.clerk.accounts.dev
```

Copy this URL.

### Step 4: Update Your .env.local
Add this line to your `.env.local` file:
```env
CLERK_JWT_ISSUER_URL=https://star-leopard-35.clerk.accounts.dev
```
(Replace with YOUR actual issuer URL from Step 3)

### Step 5: Restart Dev Servers
```bash
# Stop both servers (Ctrl+C)
# Then restart:
npx convex dev
npm run dev
```

## After Setup
1. Clear your browser cache or use incognito mode
2. Sign in again with Clerk
3. Dashboard should load successfully!

---

**Why this is needed:** Clerk uses JWT tokens to authenticate with Convex. Without the template, Clerk doesn't know how to create a token for Convex, resulting in the 404 error you're seeing.
