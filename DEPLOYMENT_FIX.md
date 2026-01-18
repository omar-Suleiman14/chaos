# Fix Convex Connection Issues on Vercel

## 🔧 Quick Fix Steps

### 1️⃣ Add Environment Variables to Vercel

Go to your [Vercel Project Settings](https://vercel.com/dashboard) → **Settings** → **Environment Variables**

Add these **EXACT** variables for **Production, Preview, and Development**:

| Variable Name | Value (from your .env.local) |
|--------------|------------------------------|
| `CONVEX_DEPLOYMENT` | `dev:wary-echidna-610` |
| `NEXT_PUBLIC_CONVEX_URL` | `https://wary-echidna-610.convex.cloud` |
| `CLERK_JWT_ISSUER_URL` | `https://star-leopard-35.clerk.accounts.dev` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_c3Rhci1sZW9wYXJkLTM1LmNsZXJrLmFjY291bnRzLmRldiQ` |
| `CLERK_SECRET_KEY` | `sk_test_yeWBFlyyeeMvIjqBTKVUoyuEQKdCxIhD5WlJHB7Mou` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

> ⚠️ **CRITICAL**: Make sure `CLERK_JWT_ISSUER_URL` is set (not just `CLERK_ISSUER_URL`)

### 2️⃣ Configure Convex for Production

You need to deploy to a **production** Convex deployment:

```bash
# Deploy Convex to production (deploys to prod by default)
npx convex deploy
```

This will give you a new production URL like `https://your-project-123.convex.cloud`

**Update your Vercel environment variables with the production URL:**
- `CONVEX_DEPLOYMENT` → production deployment name (e.g., `prod:your-project-123`)
- `NEXT_PUBLIC_CONVEX_URL` → production URL (e.g., `https://your-project-123.convex.cloud`)

### 3️⃣ Configure Convex Dashboard

1. Go to [Convex Dashboard](https://dashboard.convex.dev/)
2. Select your project
3. Go to **Settings** → **URL Configuration**
4. Add your Vercel production domain: `https://your-app.vercel.app`
5. This allows Convex to accept connections from your domain

### 4️⃣ Redeploy Vercel

After adding all environment variables:

```bash
git add .
git commit -m "fix: update Convex auth config"
git push
```

Or manually trigger a redeploy in Vercel dashboard.

## 🔍 Verification Checklist

### In Vercel Dashboard:
- [ ] All environment variables are set
- [ ] Variables are enabled for Production, Preview, and Development
- [ ] No typos in variable names (especially `CLERK_JWT_ISSUER_URL`)

### In Convex Dashboard:
- [ ] Your Vercel domain is added to allowed domains
- [ ] Production deployment is active
- [ ] Clerk authentication is properly configured

### Test Your Deployment:
1. Open browser console on your Vercel URL
2. Look for Convex connection logs
3. Should see "Convex client connected" (no WebSocket errors)
4. Try signing in and accessing dashboard

## 🚨 Common Issues

### Issue: "WebSocket connection failed"
**Solution:** 
- Ensure `NEXT_PUBLIC_CONVEX_URL` is set in Vercel
- Use production Convex deployment, not dev
- Add Vercel domain to Convex dashboard

### Issue: "Unauthorized" errors
**Solution:**
- Verify `CLERK_JWT_ISSUER_URL` exactly matches Clerk dashboard
- Check `CLERK_SECRET_KEY` is correct
- Ensure Clerk JWT template is configured in Clerk dashboard

### Issue: Still seeing 404s
**Solution:**
- Clear Vercel build cache
- Check that `public` folder exists in your repo
- Verify `vercel.json` is committed

## 📝 Production vs Development

**Development (local):**
- Uses `dev:wary-echidna-610` deployment
- Environment variables in `.env.local`

**Production (Vercel):**
- Should use `prod:your-deployment` 
- Environment variables in Vercel dashboard
- Requires `npx convex deploy --prod`
