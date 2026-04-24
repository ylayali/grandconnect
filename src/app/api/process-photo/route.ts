import { NextRequest, NextResponse } from 'next/server';
import { rembg } from '@remove-background-ai/rembg.js';

export async function POST(request: NextRequest) {
    try {
        if (!process.env.REMBG_API_KEY) {
            return NextResponse.json(
                { error: 'Server configuration error: REMBG_API_KEY not found.' },
                { status: 500 }
            );
        }

        const { imageBase64 } = await request.json();

        if (!imageBase64) {
            return NextResponse.json(
                { error: 'Missing imageBase64 parameter.' },
                { status: 400 }
            );
        }

        console.log('Processing image with rembg SDK...');

        // Use the rembg SDK with base64 input
        // Note: For serverless functions, we'll write to a temp buffer
        const result = await rembg({
            apiKey: process.env.REMBG_API_KEY,
            inputImage: { base64: imageBase64 },
            onUploadProgress: () => {}, // Required but not needed
            onDownloadProgress: () => {}, // Required but not needed
        });

        // Read the output file and convert to base64
        const fs = await import('fs/promises');
        
        if (!result.outputImagePath) {
            throw new Error('No output path returned from rembg');
        }
        
        const imageBuffer = await fs.readFile(result.outputImagePath);
        const base64 = imageBuffer.toString('base64');
        
        // Cleanup the temp file
        if (result.cleanup) {
            result.cleanup();
        }

        // Return the transparent PNG as base64
        return NextResponse.json({
            transparentPng: `data:image/png;base64,${base64}`,
        });

    } catch (error) {
        console.error('Error in /api/process-photo:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Failed to process image: ${errorMessage}` },
            { status: 500 }
        );
    }
}
