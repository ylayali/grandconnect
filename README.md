# Faraway Grandparents Setup Wizard 🎮👴👵

A Progressive Web App (PWA) that allows grandparents and family members to set up their profiles for the Faraway Grandparents game. Built with Next.js, TypeScript, and Supabase.

## Overview

This is the grandparent-facing setup wizard where family members can:
- ✅ Create their game profile with photo and voice
- ✅ Invite other family members to join
- ✅ Register for push notifications
- ✅ Generate personalized coloring pages
- ✅ Share the game with grandchildren

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth with family codes
- **Push Notifications**: Web Push API with VAPID
- **Image Processing**: Rembg.com API (background removal)
- **AI Generation**: OpenAI GPT-Image-1 (coloring pages)

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Main wizard component
│   │   ├── layout.tsx               # Root layout
│   │   └── api/
│   │       ├── process-photo/       # Background removal
│   │       ├── generate-coloring/   # Coloring page generation
│   │       ├── validate-invite/     # Invite link validation
│   │       ├── send-invite/         # Generate invite links
│   │       ├── check-family-code/   # Family code validation
│   │       ├── send-notification/   # Push notifications
│   │       └── coloring-complete/   # Coloring completion webhook
│   ├── components/
│   │   ├── cropper-wrapper.tsx      # Photo cropping component
│   │   └── ui/                      # Reusable UI components
│   └── lib/
│       └── utils.ts                 # Utility functions
├── public/
│   ├── sw.js                        # Service worker (push notifications)
│   └── manifest.json                # PWA manifest
└── supabase-migrations.sql          # Database schema
```

## Getting Started

### 1. Prerequisites

- Node.js 18+ installed
- Supabase account and project
- OpenAI API key (for GPT-Image-1)
- Rembg.com API key (for background removal)

### 2. Clone and Install

```bash
npm install
```

### 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

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

### 4. Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

### 5. Set Up Database

Run the SQL migrations in `supabase-migrations.sql` in your Supabase SQL editor:

```sql
-- Create tables, indexes, RLS policies, etc.
-- See supabase-migrations.sql for complete schema
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## The 4-Step Wizard Flow

### Step 1: Account
- Enter family code (or create new family)
- Enter grandparent's name
- Validate family code uniqueness

### Step 2: Photo
- Upload selfie
- Crop to free aspect ratio (using Cropper.js)
- Automatic background removal (Rembg API)
- Resize to 100px height for game sprite
- Upload to Supabase Storage

### Step 3: Voice
- Record audio prompts using MediaRecorder API
- Role-based scripts (owner vs guest)
- Upload to Supabase Storage
- Mark as recorded in database

### Step 4: Coloring Page & Finish
- Preview uploaded photo
- Select game setting (castle, beach, space, etc.)
- Generate AI coloring page (OpenAI GPT-Image-1)
- Register for push notifications (optional)
- Save all data to Supabase
- Show celebration screen with sharing options

## Guest Invitation System

Family members can invite guests (other grandparents, aunts, uncles) to join the game:

1. **Owner** generates invite link with unique token
2. **Guest** opens link → enters name → records voice → registers for notifications
3. **Guest** automatically added to family database
4. **Guest** can receive push notifications when found in game

## Push Notification System

### What Grandparents Receive

When a grandchild plays the game and finds a family member:

**Free Game (Single Grandparent):**
1. First find: Text notification ("You were found in the castle!")
2. Second find: Screenshot of the found moment
3. Third find: Colored coloring page screenshot
4. Cycle repeats

**Full Family Game (Multiple Members):**
- Any member found: Screenshot to that specific person
- Coloring page complete: Screenshot to owner with all family members

### Implementation Details

See [CHILD_GAME_NOTIFICATION_GUIDE.md](CHILD_GAME_NOTIFICATION_GUIDE.md) for complete implementation details for the child-facing game.

## Database Schema

### Key Tables

- **family_members**: Stores all family members (owners and guests)
  - Fields: name, role, family_code, photo_url, voice_url, push_subscription, found_count
  
- **coloring_sessions**: Tracks completed coloring pages
  - Fields: family_code, child_name, screenshot_url, found_members
  
- **game_audio_scripts**: Default and custom audio prompts
  - Fields: category, script_text, required_for (owner/guest/both)

## API Routes

### POST /api/process-photo
Receives cropped base64 photo, removes background (Rembg API), returns transparent PNG.

### POST /api/generate-coloring
Receives photo + setting, generates coloring page (OpenAI GPT-Image-1), returns URL.

### POST /api/validate-invite
Validates invite token, returns family code if valid.

### POST /api/send-invite
Generates unique invite link for family members.

### POST /api/check-family-code
Checks if family code exists in database.

### POST /api/send-notification
Sends push notification to specific family member.

### POST /api/coloring-complete
Handles coloring page completion, uploads screenshot, sends notifications.

## Deployment

### Cloudflare Pages (Recommended)

1. Build the app:
   ```bash
   npm run build
   ```

2. Deploy the `.next` folder to Cloudflare Pages
3. Set environment variables in Cloudflare dashboard
4. Enable Edge Functions for API routes

### Environment Variables for Production

Make sure to set all environment variables in your hosting platform:
- Supabase credentials
- OpenAI API key
- Rembg API key
- VAPID keys (public and private)
- VAPID email

## Security Features

✅ **Row Level Security (RLS)**: All database queries require `x-family-code` header
✅ **No exposed API keys**: OpenAI and Rembg keys only in API routes
✅ **Service role key**: Only used server-side for admin operations
✅ **Invite tokens**: UUID-based, expire after use
✅ **Push subscriptions**: Stored securely, never logged

## PWA Features

- ✅ Installable on mobile devices
- ✅ Works offline (with service worker)
- ✅ Push notifications support
- ✅ Responsive design for tablets and phones
- ✅ Touch-friendly interface

## Development

### Run dev server:
```bash
npm run dev
```

### Build for production:
```bash
npm run build
```

### Start production server:
```bash
npm start
```

### Run tests:
```bash
npm test
```

## Troubleshooting

### Push notifications not working?
- Check VAPID keys are set correctly
- Verify service worker is registered (check browser console)
- Ensure HTTPS is enabled (required for push notifications)
- Check push_subscription exists in database

### Photo upload failing?
- Verify Rembg API key is valid
- Check Supabase storage bucket exists (family-photos, coloring-pages)
- Ensure file size limits are not exceeded

### Coloring page generation stuck?
- OpenAI API may take 2-3 minutes (as warned to users)
- Check OpenAI API key is valid
- Verify API quota is not exceeded

### Family code validation failing?
- Check RLS policies on family_members table
- Ensure x-family-code header is included in Supabase queries
- Verify Supabase anon key is correct

## Future Enhancements

- [ ] Family members management page
- [ ] Stripe payment integration for upgrades
- [ ] Edit profile functionality
- [ ] Delete family member functionality
- [ ] Admin dashboard for analytics
- [ ] Multi-language support

## Contributing

This is a private project for Faraway Grandparents. For questions or issues, please contact the development team.

## License

Proprietary - All rights reserved

---

Built with ❤️ for grandparents and grandchildren everywhere.