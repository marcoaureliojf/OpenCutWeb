import { Button } from "@/components/ui/button";
import { PanelBaseView as BaseView } from "@/components/editor/panels/panel-base-view";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { useState, useRef } from "react";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { TRANSCRIPTION_LANGUAGES } from "@/constants/transcription-constants";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/types/transcription";
import { transcriptionService } from "@/services/transcription/service";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";

export function Captions() {
	const [transcriptionMode, setTranscriptionMode] = useState<"local" | "server">("local");
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditor();

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			setProcessingStep(`Loading model ${Math.round(progress.progress)}%`);
		} else if (progress.status === "transcribing") {
			setProcessingStep("Transcribing...");
		}
	};

	const pollTranscriptionStatus = async (jobId: string): Promise<any> => {
		let retryCount = 0;
		const MAX_RETRIES = 5;

		return new Promise((resolve, reject) => {
			const interval = setInterval(async () => {
				try {
					const response = await fetch(`/api/transcribe/${jobId}`);
					
					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					const data = await response.json();
					retryCount = 0; // Reset on success

					if (data.status === "SUCCESS") {
						clearInterval(interval);
						resolve(data.result);
					} else if (data.status === "FAILURE") {
						clearInterval(interval);
						reject(new Error("Server-side transcription failed"));
					} else if (data.status === "PROGRESS" && data.progress !== undefined) {
						setProcessingStep(`Server processing... (${data.progress}%)`);
					} else {
						const statusStr = data.status || "PENDING";
						setProcessingStep(`Server processing... (${statusStr})`);
					}
				} catch (error) {
					console.warn(`Polling error: ${error}. Retry ${retryCount}/${MAX_RETRIES}`);
					retryCount++;
					if (retryCount >= MAX_RETRIES) {
						clearInterval(interval);
						reject(error);
					}
				}
			}, 3000); // 3 seconds interval
		});
	};

	const handleGenerateTranscript = async () => {
		try {
			setIsProcessing(true);
			setError(null);
			setProcessingStep("Extracting audio...");

			const audioBlob = await extractTimelineAudio({
				tracks: editor.timeline.getTracks(),
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			let result;

			if (transcriptionMode === "local") {
				setProcessingStep("Preparing audio...");
				const { samples } = await decodeAudioToFloat32({ audioBlob });

				result = await transcriptionService.transcribe({
					audioData: samples,
					language: selectedLanguage === "auto" ? undefined : selectedLanguage,
					onProgress: handleProgress,
				});
			} else {
				setProcessingStep("Uploading to server...");
				const formData = new FormData();
				formData.append("file", audioBlob, "audio.wav");

				const response = await fetch("/api/transcribe", {
					method: "POST",
					body: formData,
				});

				const { jobId, error: submitError } = await response.json();
				if (submitError) throw new Error(submitError);

				setProcessingStep("Waiting for server...");
				result = await pollTranscriptionStatus(jobId);
			}

			setProcessingStep("Generating captions...");
			const captionChunks = buildCaptionChunks({ segments: result.segments });

			const captionTrackId = editor.timeline.addTrack({
				type: "text",
				index: 0,
			});

			for (let i = 0; i < captionChunks.length; i++) {
				const caption = captionChunks[i];
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: captionTrackId },
					element: {
						...DEFAULT_TEXT_ELEMENT,
						name: `Caption ${i + 1}`,
						content: caption.text,
						duration: caption.duration,
						startTime: caption.startTime,
						fontSize: 10,
						fontWeight: "bold",
					},
				});
			}
		} catch (error) {
			console.error("Transcription failed:", error);
			const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
			
			if (errorMessage.toLowerCase().includes("quota")) {
				setError(
					"Seu navegador está sem espaço para salvar o modelo de transcrição. Por favor, limpe os cookies/dados do site em 'Configurações do Site' e tente novamente."
				);
			} else {
				setError(errorMessage);
			}
		} finally {
			setIsProcessing(false);
			setProcessingStep("");
		}
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	return (
		<BaseView
			ref={containerRef}
			className="flex h-full flex-col justify-between"
		>
			<div className="flex flex-col gap-5">
				<div className="flex flex-col gap-2">
					<Label>Processing Mode</Label>
					<Tabs
						value={transcriptionMode}
						onValueChange={(v) => setTranscriptionMode(v as any)}
						className="w-full"
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="local">Browser</TabsTrigger>
							<TabsTrigger value="server">Server (Beta)</TabsTrigger>
						</TabsList>
					</Tabs>
					<p className="text-muted-foreground text-[10px]">
						{transcriptionMode === "local" 
							? "Uses your browser's CPU. Great for privacy, can be slow." 
							: "Uses the server's CPU. Faster and works even if your browser is out of space."}
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<Label>Language</Label>
					<Select
						value={selectedLanguage}
						onValueChange={(value) => handleLanguageChange({ value })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a language" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Auto detect</SelectItem>
							{TRANSCRIPTION_LANGUAGES.map((language) => (
								<SelectItem key={language.code} value={language.code}>
									{language.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="flex flex-col gap-4">
				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				<Button
					className="w-full"
					onClick={handleGenerateTranscript}
					disabled={isProcessing}
				>
					{isProcessing && <Spinner className="mr-1" />}
					{isProcessing ? processingStep : "Generate transcript"}
				</Button>
			</div>
		</BaseView>
	);
}
