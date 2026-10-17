# Shader Graph Node Catalog

Use this as a compact routing guide before selecting nodes or deciding to use a custom function.

## Inputs

- `TextureColor`: current source texture at original UVs, output `vec4 out`.
- `TextureCoords`: source UV, output `vec2 out`.
- `ScreenCoords`: screen position, output `vec2 out`.
- `VertexColor`: draw color, output `vec4 out`.
- `Time`: animated time, output `float out`, declares `u_time`.
- `Resolution`: screen size, output `vec2 out`.
- Parameter nodes: `FloatParameter`, `Vec2Parameter`, `Vec3Parameter`, `Vec4Parameter`, `ColorParameter`, `BooleanParameter`, `TextureParameter`.
- Constant nodes: `FloatConstant`, `Vec2Constant`, `Vec3Constant`, `Vec4Constant`.

Prefer parameter nodes for controls the user should tune after creation. Prefer constants for internal fixed values.

## Math And Vector

Scalar math: `Add`, `Subtract`, `Multiply`, `Divide`, `Power`, `Clamp`, `Lerp`, `Step`, `Smoothstep`, `Sin`, `Cos`, `Abs`, `Fract`, `Floor`, `Min`, `Max`, `Modulo`, `Negate`, `Saturate`, `Remap`, `Sqrt`, `Ceil`, `Round`, `Sign`, `Tan`, `Log`, `Exp`, `Atan2`.

Vector helpers: `Split4`, `Combine4`, `SplitRGB`, `CombineRGB`, `SwizzleVec2`, `Normalize`, `Length`, `Dot`, `SplitVec2`, `Combine2`, `SplitVec3`, `Combine3`, `LengthVec2`, `NormalizeVec2`, `DotVec2`, `AddVec2`, `SubtractVec2`, `ScaleVec2`, and related vec3/vec4 variants.

Use graph math for simple signal shaping. Use `CustomFunction` when a procedural mask needs loops, repeated hash calls, or several coupled intermediate values.

## Color And Composite

- `HitFlash`: mix a sprite toward a color by amount.
- `Opacity2D`: multiply alpha by opacity.
- `Dissolve2D`: noise threshold dissolve with edge color.
- `Outline2D`: sprite-alpha outline.
- `Fresnel2D`: radial/rim mask.
- `Vignette`: darken edges.
- `ChromaticAberration`: split color channels from center.
- `Desaturate`, `HueShift`, `InvertColor`, `Contrast`, `PosterizeColor`, `Brightness`, `GammaCorrect`.
- `BlendAdd`, `BlendScreen`, `BlendOverlay`, `MultiplyColor`, `CompositeAlpha`, `BlendModes`, `EffectMix`.
- Mask nodes: `AlphaMask`, `LumaMask`, `MaskRange`, `ColorKeyMask`, `MaskCombine`.
- Palette/color nodes: `PaletteSwap`, `GradientMap`, `ColorRamp`, Lab/LCH color nodes.

Use `CompositeAlpha` for layered shapes and overlays. Preserve source alpha unless the effect is explicitly a mask or full-screen overlay.

## Noise, Pattern, And Halftone

- `SimpleNoise`: hash noise from UV.
- `GradientNoise`, `FBMNoise`: smoother procedural noise.
- `VoronoiCells`: cellular masks for shields, sparks, magic, cracks.
- `Checkerboard`: alternating region masks.
- `TruchetTiles`: tileable arc patterns with motion.
- Patterns: `PatternZigZag`, `PatternSineWaves`, `PatternRoundWaves`, `PatternDots`, `PatternSpiral`, `PatternWhirl`.
- Halftone: `HalftoneMono`, `HalftoneColor`.

Use noise/pattern nodes for masks, not only color. Combine with `HitFlash`, `Dissolve2D`, `Opacity2D`, or `CompositeAlpha`.

## UV And Distortion

- `TilingOffset`: tile and scroll UVs.
- `RotateUV`: rotate around center.
- `TwirlUV`: vortex/portal twist.
- `PolarCoordinates`: radial coordinate conversion.
- `ZoomUV`, `FlipUV`.
- `WaveDistort`: sine-wave UV displacement.
- `WaterDisplace`, `MaskedWaterDisplace`, `WaterNoiseUV`, `WaterDisplaceV2`.
- `Pixelate`: quantized UV sampling.

Pattern: transform UV first, then sample the sprite with `SampleTexture` or `SpriteTextureSample`.

## Fake 3D

- `BillboardUV`: tilt sprite card in UV space; outputs warped UV, mask, and depth.
- `SpriteTextureSample`: sample source texture at controlled UV with mask.
- `FakeDepthShade`: shade based on fake depth derivatives.
- `BillboardShadow`: soft projected card shadow.
- `ParallaxUV`: offset UVs by height/view.
- `AtlasSliceUV`, `StackedSpriteSample`: atlas and layered sprite helpers.

Use these for card tilt, item pickup previews, pseudo-3D particles, stack sprites, and shadows.

## Pixel Perfect

Use pixel-perfect nodes for crisp one-pixel primitives:

- Points/rays/lines: `PixelPoint`, `PixelPointGrid`, `PixelRay`, `PixelRays`, `PixelLine`, `PixelLines`.
- Shapes: `PixelCircle`, `PixelPolygon`.

These nodes use derivatives to stay crisp at the preview scale.

## SDF

- Shapes: `SDFLine`, `SDFCircle`, `SDFRect`, `SDFPolygon`.
- Sampling: `SDFSample`, `SDFSampleStrip`.
- Boolean composition: `SDFBoolean`, `SDFSoftBoolean`.

Use SDF nodes for anti-aliased masks, badges, rings, soft clipping, crescents, and clean procedural shapes.

## Vertex

- `VertexPosition`: original vertex position.
- `VertexWave2D`: animated vertex offset.
- `TransformMatrix`, `MatVecMul`.
- `VertexOutput`: optional vertex-stage output.

Only add vertex nodes when the effect needs geometry movement; most sprite effects should stay fragment-only.

## Existing Preset Patterns

Useful built-in preset names and their core pattern:

- `Texture Pass`: `TextureColor` to `FragmentOutput`.
- `Fake 3D Billboard`: `BillboardUV` -> `SpriteTextureSample` -> `FakeDepthShade` + `BillboardShadow` -> `CompositeAlpha`.
- `Outline`: `TextureColor` + `TextureCoords` + thickness/color -> `Outline2D`.
- `Wave`: `TextureCoords` + `Time` -> `WaveDistort` -> sample.
- `Dissolve`: `TextureColor` + `TextureCoords` + threshold/softness/edge color -> `Dissolve2D`.
- `Rim Glow`: `Fresnel2D` mask into `HitFlash`.
- `Twirl Portal`: `TwirlUV` -> sample.
- `Voronoi Energy`: `VoronoiCells` -> `OneMinus` -> `HitFlash`.
- `Water Shimmer`: `WaterDisplace` -> sample.
- `Masked Water Shimmer`: `MaskedWaterDisplace`.
- `SDF Ring Glow`: `SDFCircle` -> `SDFSampleStrip` -> `HitFlash`.

When a user asks for a common effect, start from a matching preset pattern and expose the important constants as parameter nodes.
