import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        // Initialize OpenAI client inside the handler (not at module level)
        // This prevents build-time errors when env vars aren't available
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || '',
        });

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: 'Server configuration error: OPENAI_API_KEY not found.' },
                { status: 500 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

        const { photoBase64, familyCode, gameId, setting } = await request.json();

        if (!photoBase64 || !familyCode || !gameId || !setting) {
            return NextResponse.json(
                { error: 'Missing required parameters: photoBase64, familyCode, gameId, and setting.' },
                { status: 400 }
            );
        }

        // Convert base64 to blob for OpenAI
        const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const photoFile = new File([buffer], 'photo.png', { type: 'image/png' });

        // Create the detailed prompt with setting
        const prompt = `turn the face from this photo into a line drawing suitable for a colouring page, ensuring features remain recognisable. place the result on a cartoony body, also drawn in a colouring page style. position this entire figure in a way that makes sense in a ${setting} background - all elements to be drawn in a matching colouring page style. ensure that, next to the main figure, there is an empty white rectangle the right size for a child figure to be drawn in. DO NOT draw a child - just leave an obvious space where one can be drawn`;

        // Call OpenAI gpt-image-1.5 edit endpoint with specific settings
        const result = await openai.images.edit({
            model: 'gpt-image-1.5',
            image: photoFile,
            prompt: prompt,
            n: 1,
            size: '1536x1024',
            quality: 'medium',
        });

        if (!result.data || result.data.length === 0) {
            return NextResponse.json(
                { error: 'No image generated from OpenAI.' },
                { status: 500 }
            );
        }

        const coloringPageBase64 = result.data[0].b64_json;
        
        // Save to Supabase storage
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const blob = await (await fetch(`data:image/png;base64,${coloringPageBase64}`)).blob();
        const fileName = `${familyCode}_${gameId}coloring_page.png`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('coloring-pages')
            .upload(fileName, blob, { upsert: true });

        if (uploadError) {
            console.error('Error uploading to Supabase:', uploadError);
            // Return the base64 even if upload fails
            return NextResponse.json({
                coloringPageBase64,
                coloringPageUrl: null,
            });
        }

        // Get the public URL
        const { data: urlData } = supabase.storage
            .from('coloring-pages')
            .getPublicUrl(fileName);

        const coloringPageUrl = urlData.publicUrl;

        // Update the grandparents table with the coloring page URL
        const { error: dbError } = await supabase
            .from('grandparents')
            .update({ coloring_page_url: coloringPageUrl })
            .eq('game_id', gameId)
            .eq('family_code', familyCode);

        if (dbError) {
            console.error('Error updating database:', dbError);
        }

        return NextResponse.json({
            coloringPageBase64,
            coloringPageUrl,
            success: true,
        });

    } catch (error) {
        console.error('Error in /api/generate-coloring:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred during coloring page generation.' },
            { status: 500 }
        );
    }
}
