import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { familyCode, email } = body;

        if (!familyCode || !email) {
            return NextResponse.json(
                { error: 'Family code and email are required' },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    'x-family-code': familyCode,
                },
            },
        });

        // Check if family exists
        const { data: family, error: familyError } = await supabase
            .from('families')
            .select('*')
            .eq('family_code', familyCode)
            .single();

        if (familyError || !family) {
            return NextResponse.json(
                { error: 'Family not found' },
                { status: 404 }
            );
        }

        // Check if family can add more members
        const { data: existingMembers, error: membersError } = await supabase
            .from('family_members')
            .select('id')
            .eq('family_code', familyCode);

        if (membersError) {
            throw membersError;
        }

        if (existingMembers && existingMembers.length >= family.family_members_limit) {
            return NextResponse.json(
                { 
                    error: 'Family member limit reached. Please upgrade to invite more family members.',
                    limit: family.family_members_limit
                },
                { status: 403 }
            );
        }

        // Check if email already invited
        const { data: existingInvite } = await supabase
            .from('family_invites')
            .select('*')
            .eq('family_code', familyCode)
            .eq('email', email)
            .eq('status', 'pending')
            .single();

        if (existingInvite) {
            return NextResponse.json(
                { error: 'This email already has a pending invite' },
                { status: 409 }
            );
        }

        // Generate unique invite token
        const inviteToken = uuidv4();

        // Create invitation
        const { error: inviteError } = await supabase
            .from('family_invites')
            .insert({
                family_code: familyCode,
                email: email,
                invite_token: inviteToken,
                status: 'pending',
                created_at: new Date().toISOString(),
            });

        if (inviteError) {
            throw inviteError;
        }

        // TODO: Send email with invite link
        // For now, return the invite link in the response
        const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join?token=${inviteToken}`;

        return NextResponse.json({
            success: true,
            invite_token: inviteToken,
            invite_link: inviteLink,
            message: 'Invitation created successfully',
        });

    } catch (error) {
        console.error('Error sending invite:', error);
        return NextResponse.json(
            { error: 'Failed to send invite' },
            { status: 500 }
        );
    }
}