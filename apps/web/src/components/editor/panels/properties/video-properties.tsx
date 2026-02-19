import type { ImageElement, VideoElement } from "@/types/timeline";
import { useEditor } from "@/hooks/use-editor";
import { useMemo } from "react";
import { PropertyGroup, PropertyItem, PropertyItemLabel, PropertyItemValue } from "./property-item";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { PanelBaseView } from "@/components/editor/panels/panel-base-view";

export function VideoProperties({
	_element,
}: {
	_element: VideoElement | ImageElement;
}) {
	const editor = useEditor();
	const assets = editor.media.getAssets();
	
	const asset = useMemo(() => 
		assets.find(a => a.id === _element.mediaId),
		[assets, _element.mediaId]
	);

	const updateProperty = (updates: any) => {
		const tracks = editor.timeline.getTracks();
		const track = tracks.find((t) =>
			t.elements.some((e) => e.id === _element.id),
		);
		if (!track) return;

		editor.timeline.updateElements({
			updates: [
				{
					trackId: track.id,
					elementId: _element.id,
					updates,
				},
			],
		});
	};

	const assetWidth = asset?.width || 0;
	const assetHeight = asset?.height || 0;

	// Calculate crop margins as percentages for sliders
	const cropMargins = useMemo(() => {
		const c = _element.transform?.crop;
		if (!c || assetWidth === 0 || assetHeight === 0) return { left: 0, right: 0, top: 0, bottom: 0 };
		
		return {
			left: (c.x / assetWidth) * 100,
			right: ((assetWidth - c.x - c.width) / assetWidth) * 100,
			top: (c.y / assetHeight) * 100,
			bottom: ((assetHeight - c.y - c.height) / assetHeight) * 100
		};
	}, [_element.transform?.crop, assetWidth, assetHeight]);

	const updateCrop = (margins: Partial<{ left: number, right: number, top: number, bottom: number }>) => {
		if (assetWidth === 0 || assetHeight === 0) return;

		const m = { ...cropMargins, ...margins };
		
		// Ensure width/height don't go negative or too small
		if (m.left + m.right >= 100) return;
		if (m.top + m.bottom >= 100) return;

		const x = (m.left / 100) * assetWidth;
		const y = (m.top / 100) * assetHeight;
		const width = ((100 - m.left - m.right) / 100) * assetWidth;
		const height = ((100 - m.top - m.bottom) / 100) * assetHeight;

		updateProperty({
			transform: {
				..._element.transform,
				crop: { x, y, width, height }
			}
		});
	};

	return (
		<div className="flex h-full flex-col">
			<PanelBaseView className="p-0">
				<PropertyGroup title="Transform" hasBorderTop={false} collapsible={false}>
					<div className="space-y-4">
						<PropertyItem direction="column">
							<PropertyItemLabel>Opacity</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[(_element.opacity || 1) * 100]}
										min={0}
										max={100}
										step={1}
										onValueChange={([val]) => updateProperty({ opacity: val / 100 })}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round((_element.opacity || 1) * 100)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						<PropertyItem direction="column">
							<PropertyItemLabel>Scale</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[(_element.transform?.scale || 1) * 100]}
										min={1}
										max={500}
										step={1}
										onValueChange={([val]) => updateProperty({ 
											transform: { ..._element.transform, scale: val / 100 } 
										})}
									/>
									<span className="text-xs min-w-[4ch]">{Math.round((_element.transform?.scale || 1) * 100)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						<div className="grid grid-cols-2 gap-4">
							<PropertyItem direction="column">
								<PropertyItemLabel>Position X</PropertyItemLabel>
								<PropertyItemValue>
									<Input 
										type="number" 
										size="sm"
										className="h-7 text-xs"
										value={Math.round(_element.transform?.position?.x || 0)}
										onChange={(e) => updateProperty({
											transform: { 
												..._element.transform, 
												position: { ..._element.transform.position, x: Number(e.target.value) } 
											}
										})}
									/>
								</PropertyItemValue>
							</PropertyItem>
							<PropertyItem direction="column">
								<PropertyItemLabel>Position Y</PropertyItemLabel>
								<PropertyItemValue>
									<Input 
										type="number" 
										size="sm"
										className="h-7 text-xs"
										value={Math.round(_element.transform?.position?.y || 0)}
										onChange={(e) => updateProperty({
											transform: { 
												..._element.transform, 
												position: { ..._element.transform.position, y: Number(e.target.value) } 
											}
										})}
									/>
								</PropertyItemValue>
							</PropertyItem>
						</div>

						<PropertyItem direction="column">
							<PropertyItemLabel>Rotation</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[_element.transform?.rotate || 0]}
										min={-180}
										max={180}
										step={1}
										onValueChange={([val]) => updateProperty({ 
											transform: { ..._element.transform, rotate: val } 
										})}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round(_element.transform?.rotate || 0)}°</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
					</div>
				</PropertyGroup>

				<PropertyGroup title="Crop" collapsible={true} defaultExpanded={false}>
					<div className="space-y-4">
						<PropertyItem direction="column">
							<PropertyItemLabel>Crop Left</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[cropMargins.left]}
										min={0}
										max={99}
										step={1}
										onValueChange={([val]) => updateCrop({ left: val })}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round(cropMargins.left)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
						<PropertyItem direction="column">
							<PropertyItemLabel>Crop Right</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[cropMargins.right]}
										min={0}
										max={99}
										step={1}
										onValueChange={([val]) => updateCrop({ right: val })}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round(cropMargins.right)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
						<PropertyItem direction="column">
							<PropertyItemLabel>Crop Top</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[cropMargins.top]}
										min={0}
										max={99}
										step={1}
										onValueChange={([val]) => updateCrop({ top: val })}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round(cropMargins.top)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
						<PropertyItem direction="column">
							<PropertyItemLabel>Crop Bottom</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[cropMargins.bottom]}
										min={0}
										max={99}
										step={1}
										onValueChange={([val]) => updateCrop({ bottom: val })}
									/>
									<span className="text-xs min-w-[3ch]">{Math.round(cropMargins.bottom)}%</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
					</div>
				</PropertyGroup>

				{asset && (
					<PropertyGroup title="Media Info" collapsible={true} defaultExpanded={false}>
						<div className="space-y-2 text-[10px] text-muted-foreground">
							<div className="flex justify-between">
								<span>Filename</span>
								<span className="text-foreground truncate ml-4" title={asset.name}>{asset.name}</span>
							</div>
							<div className="flex justify-between">
								<span>Resolution</span>
								<span className="text-foreground">{asset.width}x{asset.height}</span>
							</div>
							{asset.duration && (
								<div className="flex justify-between">
									<span>Duration</span>
									<span className="text-foreground">{asset.duration.toFixed(2)}s</span>
								</div>
							)}
							{asset.fps && (
								<div className="flex justify-between">
									<span>FPS</span>
									<span className="text-foreground">{asset.fps}</span>
								</div>
							)}
						</div>
					</PropertyGroup>
				)}
			</PanelBaseView>
		</div>
	);
}
