import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: NextRequest) {
    try {
        const { familyCode } = await request.json();

        if (!familyCode) {
            return NextResponse.json(
                { error: 'familyCode is required' },
                { status: 400 }
            );
        }

        // Create Supabase client with RLS header
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

        if (familyError && familyError.code !== 'PGRST116') {
            // PGRST116 means no rows found, which is okay
            console.error('Error checking family:', familyError);
            return NextResponse.json(
                { error: 'Failed to check family code' },
                { status: 500 }
            );
        }

        // Check if free entitlement exists
        const { data: entitlements, error: entitlementError } = await supabase
            .from('entitlements')
            .select('game_id')
            .eq('family_code', familyCode);

        if (entitlementError) {
            console.error('Error checking entitlements:', entitlementError);
        }

        // Get family members count
        const { data: members, error: membersError } = await supabase
            .from('family_members')
            .select('id')
            .eq('family_code', familyCode);

        const memberCount = members?.length || 0;

        return NextResponse.json({
            exists: !!family,
            familyCode,
            familyMembersLimit: family?.family_members_limit || 1,
            currentMemberCount: memberCount,
            canAddMoreMembers: memberCount < (family?.family_members_limit || 1),
            entitlements: entitlements?.map(e => e.game_id) || [],
            primaryGameId: family?.primary_game_id || 'default',
        });

    } catch (error) {
        console.error('Error in /api/check-family-code:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}