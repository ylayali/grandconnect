'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

interface CropperWrapperProps {
    src: string;
    onInit: (cropper: any) => void;
}

export interface CropperRef {
    getCroppedCanvas: (options?: any) => HTMLCanvasElement | null;
}

const CropperWrapper = forwardRef<CropperRef, CropperWrapperProps>(({ src, onInit }, ref) => {
    const imageRef = useRef<HTMLImageElement>(null);
    const cropperInstanceRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({
        getCroppedCanvas: (options?: any) => {
            if (cropperInstanceRef.current && isReady) {
                return cropperInstanceRef.current.getCroppedCanvas(options);
            }
            return null;
        }
    }));

    useEffect(() => {
        // Prevent multiple initializations
        if (!imageRef.current || cropperInstanceRef.current || !src) {
            return;
        }

        // Create the cropper instance (matching working example)
        const cropper = new Cropper(imageRef.current, {
            aspectRatio: NaN, // Freeform - no aspect ratio restriction
        });
        
        cropperInstanceRef.current = cropper;
        
        // Wait for image to load and hide original
        const checkReady = () => {
            if (imageRef.current && imageRef.current.complete) {
                // Hide the original image - cropper creates its own copy
                if (imageRef.current) {
                    imageRef.current.style.display = 'none';
                }
                setIsReady(true);
                onInit(cropper);
                console.log('Cropper initialized successfully');
            } else {
                setTimeout(checkReady, 50);
            }
        };
        
        checkReady();

        return () => {
            if (cropperInstanceRef.current) {
                cropperInstanceRef.current.destroy();
                cropperInstanceRef.current = null;
                setIsReady(false);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]); // Only re-initialize when src changes

    return (
        <div className="relative h-[70vh] min-h-[500px] w-full overflow-hidden rounded-lg border-4 border-blue-400 bg-gray-100">
            <img 
                ref={imageRef} 
                src={src} 
                alt="Upload"
                crossOrigin="anonymous"
                className="block max-w-full"
            />
        </div>
    );
});

CropperWrapper.displayName = 'CropperWrapper';

export default CropperWrapper;
