# Cloudflare Pages Deployment Guide 🚀

This guide walks you through deploying the Faraway Grandparents Setup Wizard to Cloudflare Pages.

## Prerequisites

✅ Node.js 18+ installed
✅ Git repository (GitHub, GitLab, or Bitbucket)
✅ Cloudflare account (free tier works)
✅ All environment variables ready (see `.env.example`)

## Method 1: Automatic Deployment (Recommended)

### Step 1: Push to Git Repository

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: Grandparent setup wizard"

# Add remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/grandparent-setup.git

# Push to main branch
git push -u origin main
```

### Step 2: Connect Cloudflare Pages

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/
   - Sign in to your account

2. **Create New Project**
   - Click **Workers & Pages** in the left sidebar
   - Click **Create application**
   - Click **Pages** tab
   - Click **Connect to Git**

3. **Select Git Provider**
   - Choose GitHub, GitLab, or Bitbucket
   - Authorize Cloudflare to access your repositories
   - Select your repository

4. **Configure Build Settings**
   ```
   Framework preset: Next.js
   Build command: npm run build
   Build output directory: Not required (Next.js handles this)
   Root directory: (leave empty)
   ```

5. **Environment Variables**
   
   Click **Environment variables** and add these:
   
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Rembg (Background Removal)
   REMBG_API_KEY=your_rembg_api_key
   
   # Push Notifications (VAPID)
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
   VAPID_PRIVATE_KEY=your_vapid_private_key
   VAPID_EMAIL=your_email@example.com
   ```

6. **Deploy**
   - Click **Save and Deploy**
   - Wait for build to complete (~2-3 minutes)
   - Your app will be live at: `https://your-project.pages.dev`

## Method 2: Manual Deployment (Wrangler CLI)

### Step 1: Install Wrangler

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

### Step 3: Build the App

```bash
npm run build
```

### Step 4: Create Cloudflare Pages Project

```bash
# Create project
wrangler pages project create grandparent-setup

# Deploy
wrangler pages deploy .next
```

### Step 5: Add Environment Variables

Go to Cloudflare Dashboard → Workers & Pages → Your Project → Settings → Environment Variables

Add all the environment variables listed above.

## Post-Deployment Checklist ✅

### 1. Verify Your Site

Visit your deployed site and check:
- ✅ Homepage loads correctly
- ✅ All 4 wizard steps work
- ✅ File uploads work (photo, audio)
- ✅ API routes respond correctly

### 2. Test API Routes

Check these endpoints work:
- ✅ `/api/check-family-code` - Family code validation
- ✅ `/api/process-photo` - Photo background removal
- ✅ `/api/generate-coloring` - Coloring page generation
- ✅ `/api/validate-invite` - Invite link validation
- ✅ `/api/send-invite` - Invite generation
- ✅ `/api/send-notification` - Push notifications
- ✅ `/api/coloring-complete` - Coloring completion

### 3. Configure Custom Domain (Optional)

1. Go to: Workers & Pages → Your Project → Custom Domains
2. Click **Set up a custom domain**
3. Enter your domain (e.g., `setup.farawaygrandparents.com`)
4. Follow DNS instructions

### 4. Enable Analytics (Optional)

1. Go to: Workers & Pages → Your Project → Analytics
2. Enable Web Analytics
3. Add Privacy cookie consent if needed

## Troubleshooting 🔧

### Build Failures

**Problem: Build fails with "Module not found"**
```bash
# Solution: Ensure all dependencies are installed
npm install
git add package-lock.json
git commit -m "Update dependencies"
git push
```

**Problem: Environment variables not working**
- Check variables are set in Cloudflare Dashboard (not just .env.local)
- Ensure `NEXT_PUBLIC_` prefix for client-side variables
- Re-deploy after adding variables

**Problem: API routes returning 404**
- Check build output for errors
- Verify `next.config.ts` has correct settings
- Check Cloudflare Functions are enabled

### Runtime Issues

**Problem: Push notifications not working**
- Ensure HTTPS is enabled (automatic on Cloudflare Pages)
- Check VAPID keys are correct
- Verify service worker is registered (check browser console)

**Problem: Photo upload failing**
- Check Supabase storage buckets exist
- Verify Rembg API key is valid
- Check file size limits (Supabase: 50MB default)

**Problem: Coloring page generation stuck**
- OpenAI API may take 2-3 minutes (as warned to users)
- Check OpenAI API key is valid
- Verify API quota is not exceeded
- Check Cloudflare Functions logs

### Performance Issues

**Problem: Slow first load**
- Enable Cloudflare caching (automatic)
- Check image sizes are optimized
- Consider using Cloudflare Images

**Problem: API timeouts**
- Cloudflare Functions have 10-second limit on free tier
- OpenAI API may timeout on free tier
- Solution: Upgrade to Cloudflare Workers Paid ($5/month) for 30-second limit

## Environment Variables Reference 📝

### Required Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key for GPT-Image-1 |
| `REMBG_API_KEY` | ✅ | Rembg.com API key for background removal |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ | VAPID public key (push notifications) |
| `VAPID_PRIVATE_KEY` | ✅ | VAPID private key (server-side) |
| `VAPID_EMAIL` | ✅ | Contact email for VAPID |

### Where to Find These

**Supabase:**
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy URL, anon key, and service role key

**OpenAI:**
1. Go to: https://platform.openai.com/api-keys
2. Create new API key
3. Copy and save securely

**Rembg:**
1. Go to: https://www.rem.bg
2. Sign up and get API key
3. Copy and save

**VAPID Keys:**
1. Generate with: `npx web-push generate-vapid-keys`
2. Copy public and private keys
3. Use your email for `VAPID_EMAIL`

## Update & Redeploy 🔄

### Automatic Updates

When you push to your Git repository:
1. Cloudflare automatically detects changes
2. Triggers a new build
3. Deploys to production
4. Usually takes 2-3 minutes

### Manual Redeploy

```bash
# Make changes locally
git add .
git commit -m "Update description"
git push

# Cloudflare will auto-deploy
```

### Force Redeploy

If you need to force a redeploy:
1. Go to Cloudflare Dashboard
2. Workers & Pages → Your Project
3. Deployments → Click **Retry deployment**

## Monitoring 📊

### View Build Logs

1. Go to: Workers & Pages → Your Project
2. Click on a deployment
3. View build logs

### View Function Logs

1. Go to: Workers & Pages → Your Project
2. Logs → Real-time logs
3. See API route execution logs

### Analytics

1. Go to: Workers & Pages → Your Project
2. Analytics tab
3. View:
   - Page views
   - Unique visitors
   - Geographic distribution
   - Device types

## Cost Estimate 💰

**Cloudflare Pages (Free Tier):**
- ✅ Unlimited sites
- ✅ Unlimited bandwidth
- ✅ Unlimited requests
- ✅ Build minutes: 500/month
- ✅ Functions: 100k requests/day

**When to Upgrade:**
- More than 100k daily API requests
- Need longer function execution time (30s vs 10s)
- More than 500 build minutes/month

**Paid Plan:** $20/month for additional features

## Security Best Practices 🔒

1. **Never commit `.env.local`** to git (already in `.gitignore`)
2. **Use environment variables** for all secrets
3. **Rotate API keys** regularly
4. **Monitor usage** for unusual activity
5. **Keep dependencies updated** with `npm update`
6. **Enable Cloudflare Access** for admin areas (future)

## Support & Resources 📚

- **Cloudflare Pages Docs:** https://developers.cloudflare.com/pages/
- **Next.js on Cloudflare:** https://developers.cloudflare.com/pages/framework-guides/nextjs/
- **Wrangler CLI:** https://developers.cloudflare.com/workers/wrangler/

## Next Steps

After deployment:
1. ✅ Test all wizard flows
2. ✅ Verify push notifications work
3. ✅ Test guest invitation links
4. ✅ Set up custom domain (optional)
5. ✅ Configure analytics (optional)
6. ✅ Share with beta testers

---

**Your app is now live on Cloudflare Pages!** 🎉