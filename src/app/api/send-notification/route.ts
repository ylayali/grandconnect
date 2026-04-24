import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

interface NotificationPayload {
  familyMemberId: string;
  title: string;
  body: string;
  image?: string;
  data?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    // Configure web-push inside the handler (not at module level)
    // This prevents build-time errors when env vars aren't available
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

    const { familyMemberId, title, body, image, data }: NotificationPayload = await request.json();

    if (!familyMemberId || !title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use service role key for server-side operations
    );

    // Fetch family member's push subscription
    const { data: member, error: memberError } = await supabase
      .from('family_members')
      .select('push_subscription, name')
      .eq('id', familyMemberId)
      .single();

    if (memberError || !member) {
      console.error('Error fetching family member:', memberError);
      return NextResponse.json(
        { error: 'Family member not found' },
        { status: 404 }
      );
    }

    if (!member.push_subscription) {
      return NextResponse.json(
        { error: 'No push subscription found for this user' },
        { status: 400 }
      );
    }

    // Parse push subscription
    const pushSubscription = JSON.parse(member.push_subscription);

    // Send push notification
    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon.png',
      badge: '/badge.png',
      image,
      data: data || {},
    });

    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (pushError: any) {
      // If subscription is invalid, remove it from database
      if (pushError.statusCode === 410 || pushError.code === 'ENOENT') {
        console.warn('Push subscription expired, removing from database');
        await supabase
          .from('family_members')
          .update({ push_subscription: null })
          .eq('id', familyMemberId);
      }
      throw pushError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}