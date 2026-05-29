import { sendCommand } from '@/lib/send-command';
import type { ShaderParameter, ShaderPreviewShape, ShaderTextureUpload } from '@/types/shader-graph';
import { createShaderGraphGamePreviewController } from './gamePreviewControllerCore';

type ShaderPreviewColor = [number, number, number, number];
type ShaderPreviewTextureUpload = ShaderTextureUpload & { uniform?: string };

export type ShaderGraphGamePreviewParams = {
  pixelSource: string;
  vertexSource: string;
  shape: ShaderPreviewShape;
  color: ShaderPreviewColor;
  textureUniforms: Array<{ nodeId: string; label: string; uniform: string }>;
  parameters: ShaderParameter[];
  baseTexture?: ShaderTextureUpload | null;
  textures: ShaderPreviewTextureUpload[];
  previewZoom?: number;
};

export const shaderGraphGamePreviewController = createShaderGraphGamePreviewController(sendCommand);
