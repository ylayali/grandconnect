import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json(
                { error: 'Invite token is required' },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Find the invitation
        const { data: invite, error: inviteError } = await supabase
            .from('family_invites')
            .select('*')
            .eq('invite_token', token)
            .eq('status', 'pending')
            .single();

        if (inviteError || !invite) {
            return NextResponse.json(
                { error: 'Invalid or expired invite token' },
                { status: 404 }
            );
        }

        // Check if family already has an owner
        const { data: existingOwner } = await supabase
            .from('family_members')
            .select('name')
            .eq('family_code', invite.family_code)
            .eq('role', 'owner')
            .single();

        // Return family code and owner info
        return NextResponse.json({
            family_code: invite.family_code,
            has_owner: !!existingOwner,
            owner_name: existingOwner?.name || null,
        });

    } catch (error) {
        console.error('Error validating invite:', error);
        return NextResponse.json(
            { error: 'Failed to validate invite' },
            { status: 500 }
        );
    }
}