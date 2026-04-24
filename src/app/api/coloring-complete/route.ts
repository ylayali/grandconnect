import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Configure web-push
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('VAPID keys not configured. Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'noreply@farawaygrandparents.com'}`,
    vapidPublicKey,
    vapidPrivateKey
  );
}

interface ColoringCompletePayload {
  familyCode: string;
  childName?: string;
  screenshot: string; // base64 data URL
  foundMemberIds?: string[]; // For full family game - who was found
}

export async function POST(request: NextRequest) {
  try {
    const { familyCode, childName, screenshot, foundMemberIds }: ColoringCompletePayload = await request.json();

    if (!familyCode || !screenshot) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Get owner's push subscription
    const { data: owner, error: ownerError } = await supabase
      .from('family_members')
      .select('id, push_subscription, name, found_count')
      .eq('family_code', familyCode)
      .eq('role', 'owner')
      .single();

    if (ownerError || !owner) {
      console.error('Error fetching owner:', ownerError);
      return NextResponse.json(
        { error: 'Family not found' },
        { status: 404 }
      );
    }

    // Upload screenshot to Supabase Storage
    const screenshotFileName = `${familyCode}_${Date.now()}_colored.png`;
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const screenshotBuffer = Buffer.from(base64Data, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('coloring-pages')
      .upload(screenshotFileName, screenshotBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading screenshot:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload screenshot' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('coloring-pages')
      .getPublicUrl(screenshotFileName);

    // Save to coloring_sessions table
    const { error: sessionError } = await supabase
      .from('coloring_sessions')
      .insert({
        family_code: familyCode,
        child_name: childName || 'Your grandchild',
        found_members: foundMemberIds || [owner.id],
        screenshot_url: publicUrl,
        notification_sent: true,
        completed_at: new Date().toISOString(),
      });

    if (sessionError) {
      console.error('Error saving coloring session:', sessionError);
    }

    // Send push notification to owner
    if (owner.push_subscription) {
      const pushSubscription = JSON.parse(owner.push_subscription);

      const payload = JSON.stringify({
        title: `🎨 ${childName || 'Your grandchild'} colored your page!`,
        body: 'Look at this beautiful coloring of you!',
        icon: '/icon.png',
        badge: '/badge.png',
        image: publicUrl,
        data: {
          type: 'coloring-complete',
          familyCode,
          screenshotUrl: publicUrl,
        },
      });

      try {
        await webpush.sendNotification(pushSubscription, payload);
        console.log('Push notification sent successfully');
      } catch (pushError: any) {
        // If subscription is invalid, remove it from database
        if (pushError.statusCode === 410 || pushError.code === 'ENOENT') {
          console.warn('Push subscription expired, removing from database');
          await supabase
            .from('family_members')
            .update({ push_subscription: null })
            .eq('id', owner.id);
        } else {
          console.error('Error sending push notification:', pushError);
        }
      }
    }

    // Reset found_count to 0 for free game
    await supabase
      .from('family_members')
      .update({ found_count: 0 })
      .eq('family_code', familyCode);

    return NextResponse.json({ 
      success: true,
      screenshotUrl: publicUrl,
      notificationSent: !!owner.push_subscription,
    });
  } catch (error: any) {
    console.error('Error in coloring-complete:', error);
    return NextResponse.json(
      { error: 'Failed to process coloring page completion' },
      { status: 500 }
    );
  }
}