import {
	pipeline,
	env,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import type { TranscriptionSegment } from "@/types/transcription";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
} from "@/constants/transcription-constants";

// Configure transformers.js environment
env.allowLocalModels = false; // Ensure we always check remote if not in cache
env.useBrowserCache = true;

// Disable GPU (WebGPU) to avoid hangs on Linux/Docker and force maximum compatibility
// @ts-ignore - Internal API but effective for forcing fallsback
env.backends.onnx.webgpu = false;
env.backends.onnx.gpu = false;

export type WorkerMessage =
	| { type: "init"; modelId: string }
	| { type: "transcribe"; audio: Float32Array; language: string }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId });
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({ modelId }: { modelId: string }) {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		// First attempt: with cache enabled
		try {
			transcriber = (await pipeline("automatic-speech-recognition", modelId, {
				dtype: "q4",
				device: "wasm", // Force WASM (CPU) for stability in Docker/Linux
				progress_callback: (progressInfo: {
					status?: string;
					file?: string;
					loaded?: number;
					total?: number;
				}) => {
					handleProgressUpdate(progressInfo);
				},
			})) as unknown as AutomaticSpeechRecognitionPipeline;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "";
			if (errorMessage.includes("QuotaExceededError") || errorMessage.includes("quota")) {
				console.warn("Storage quota exceeded, retrying with cache disabled...");
				env.useBrowserCache = false;
				// Second attempt: without cache (In-Memory only)
				transcriber = (await pipeline("automatic-speech-recognition", modelId, {
					dtype: "q4",
					device: "wasm",
					progress_callback: (progressInfo: {
						status?: string;
						file?: string;
						loaded?: number;
						total?: number;
					}) => {
						handleProgressUpdate(progressInfo);
					},
				})) as unknown as AutomaticSpeechRecognitionPipeline;
			} else {
				throw error;
			}
		}

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		console.error("Transcription Worker Init Error:", error);
		let errorMessage = error instanceof Error ? error.message : "Failed to load model";
		
		if (errorMessage.includes("QuotaExceededError") || errorMessage.includes("quota")) {
			errorMessage = "Storage quota exceeded. Please clear your site data and try novamente (ou use o modo em memória).";
		}

		self.postMessage({
			type: "init-error",
			error: errorMessage,
		} satisfies WorkerResponse);
	}
}

function handleProgressUpdate(progressInfo: {
	status?: string;
	file?: string;
	loaded?: number;
	total?: number;
}) {
	const file = progressInfo.file;
	if (!file) return;

	const loaded = progressInfo.loaded ?? 0;
	const total = progressInfo.total ?? 0;

	if (progressInfo.status === "progress" && total > 0) {
		fileBytes.set(file, { loaded, total });
	} else if (progressInfo.status === "done") {
		const existing = fileBytes.get(file);
		if (existing) {
			fileBytes.set(file, {
				loaded: existing.total,
				total: existing.total,
			});
		}
	}

	// sum all bytes
	let totalLoaded = 0;
	let totalSize = 0;
	for (const { loaded, total } of fileBytes.values()) {
		totalLoaded += loaded;
		totalSize += total;
	}

	if (totalSize === 0) return;

	const overallProgress = (totalLoaded / totalSize) * 100;
	const roundedProgress = Math.floor(overallProgress);

	if (roundedProgress !== lastReportedProgress) {
		lastReportedProgress = roundedProgress;
		self.postMessage({
			type: "init-progress",
			progress: roundedProgress,
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({
	audio,
	language,
}: {
	audio: Float32Array;
	language: string;
}) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		const rawResult = await transcriber(audio, {
			chunk_length_s: DEFAULT_CHUNK_LENGTH_SECONDS,
			stride_length_s: DEFAULT_STRIDE_SECONDS,
			language: language === "auto" ? undefined : language,
			return_timestamps: true,
		});

		if (cancelled) return;

		const result: AutomaticSpeechRecognitionOutput = Array.isArray(rawResult)
			? rawResult[0]
			: rawResult;

		const segments: TranscriptionSegment[] = [];

		if (result.chunks) {
			for (const chunk of result.chunks) {
				if (chunk.timestamp && chunk.timestamp.length >= 2) {
					segments.push({
						text: chunk.text,
						start: chunk.timestamp[0] ?? 0,
						end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
					});
				}
			}
		}

		self.postMessage({
			type: "transcribe-complete",
			text: result.text,
			segments,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}
