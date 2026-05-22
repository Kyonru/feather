import { useEffect, useRef } from 'react';
import { cn } from '@/utils/styles';
import { createWebGLPreview } from './webglPreview';

type Props = {
  pixelGlsl: string;
  className?: string;
};

export function ShaderPreviewCanvas({ pixelGlsl, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glslRef = useRef(pixelGlsl);
  glslRef.current = pixelGlsl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preview = createWebGLPreview(canvas, glslRef.current);
    let rafId = 0;
    const startTime = performance.now();

    function loop() {
      rafId = requestAnimationFrame(loop);
      preview.render((performance.now() - startTime) / 1000);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      preview.destroy();
    };
    // Re-create WebGL program when GLSL changes
  }, [pixelGlsl]);

  return <canvas ref={canvasRef} className={cn('block h-full w-full', className)} />;
}
